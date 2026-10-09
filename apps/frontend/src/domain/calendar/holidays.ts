/**
 * Public-holiday lookup for the planner pages, backed by the `date-holidays` package.
 *
 * Why it is shaped this way:
 *   - Scope comes from planner_settings. The create-planner form writes lower-case codes ("us",
 *     "uk", "ru") and date-holidays knows GB but not UK, so codes are normalised here and unknown
 *     ones dropped instead of being passed through. The library does not throw on an unknown
 *     country or state: an unknown country yields no holidays at all and an unknown state silently
 *     falls back to the national set, either of which would hide a typo in the settings.
 *   - The Rust build merged every subdivision of each country, so a US planner showed Guam and
 *     Texas holidays. Here a country contributes only its national holidays; subdivisions are
 *     opt-in through `holiday_regions` ("US-IL"). A region instance is country + state, so it also
 *     carries that country's national holidays even when the country is not listed separately.
 *   - Names are English wherever the data has an English translation (the UI is fixed English and
 *     the Rust build emitted English names), falling back to the native name. The language order
 *     is set once per instance because `getHolidays(year, lang)` mutates the instance's language
 *     list, and the country's own English variant stays first so the US keeps "Labor Day".
 *   - `Holidays` instances are cached: constructing one compiles the country's rule set and takes
 *     tens of milliseconds, and the weekly page asks for a seven-day window on every navigation.
 *     Per-year results are cached too since they are a pure function of (scope, year).
 *   - A multi-day holiday (Russia's "New Year Holiday", rule "01-02 P5D") is reported under every
 *     day it covers, as the Rust build did: its data listed each day as its own entry. The library
 *     returns one entry per holiday, so the span is expanded here. Its length is `end - start`
 *     rounded to whole days and anchored on the holiday's nominal `date`; rounding absorbs the
 *     one-hour DST shift inside a span, the library's 18:00-of-the-previous-day start for
 *     Islamic-calendar dates (a one-day holiday spans 24 hours from the evening before, and
 *     Turkey's Eid rules are "PT90H" / "PT114H"), and half-day holidays (Iceland's Christmas Eve
 *     from 13:00), which count as one day. Checked against every entry the library has for
 *     2024-2027 (13,604 across 207 countries): the rounded length agrees with the calendar days
 *     the span touches in the country's own time zone in every case.
 *   - The library files a holiday only under the year of its first day, and a span can cross New
 *     Year (Eswatini's "Incwala Festival", rule "12-28 P6D"), so the year before the range is
 *     gathered as well; everything else from that year fails the range check. Substitute days
 *     (New Year's Day observed on Friday 2027-12-31, say) are also reported under the year of the
 *     observed date, so no year after the range is needed.
 */

import Holidays from 'date-holidays';
import type { HolidaysTypes } from 'date-holidays';
import { addDays, assertISODate, compareISO, yearOf, type ISODate } from '../dates.ts';
import type { HolidayMap, PlannerSettings } from '../types.ts';

export interface HolidayRegion {
  /** ISO-3166 alpha-2 country code, upper case. */
  country: string;
  /** Sub-national code as date-holidays spells it ("IL", "SCT"), upper case. */
  state: string;
}

export interface HolidayScope {
  /** National scopes, de-duplicated, never empty. */
  countries: string[];
  /** Sub-national scopes, de-duplicated; each also brings its country's national holidays. */
  regions: HolidayRegion[];
}

export interface HolidaysBetweenOptions {
  /** date-holidays types to keep ("public", "bank", "optional", "school", "observance"). Default ["public"]. */
  types?: string[];
}

const DEFAULT_COUNTRY = 'US';
const DEFAULT_TYPES: readonly string[] = ['public'];
const DAY_MS = 86_400_000;
/** Codes people write that the library spells differently. */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = { UK: 'GB' };

// ---------------------------------------------------------------------------------------------
// Library catalogue (which countries and states exist), built lazily, kept for the module lifetime
// ---------------------------------------------------------------------------------------------

let catalogue: Holidays | undefined;
let knownCountries: Set<string> | undefined;
const knownStatesByCountry = new Map<string, Set<string>>();

function catalogueInstance(): Holidays {
  catalogue ??= new Holidays();
  return catalogue;
}

function isKnownCountry(code: string): boolean {
  knownCountries ??= new Set(Object.keys(catalogueInstance().getCountries()));
  return knownCountries.has(code);
}

function isKnownState(country: string, state: string): boolean {
  let states = knownStatesByCountry.get(country);
  if (!states) {
    // Typed as always present, but the library returns undefined for a country without states.
    const table: Record<string, string> | undefined = catalogueInstance().getStates(country);
    states = new Set(Object.keys(table ?? {}));
    knownStatesByCountry.set(country, states);
  }
  return states.has(state);
}

/** "us" / " uk " / "GB" → "GB"; anything the library does not know → null. */
export function normalizeCountryCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  if (code === '') return null;
  const canonical = COUNTRY_ALIASES[code] ?? code;
  return isKnownCountry(canonical) ? canonical : null;
}

/** "us-il" → { country: "US", state: "IL" }; unknown country or state → null. */
export function normalizeRegionCode(raw: unknown): HolidayRegion | null {
  if (typeof raw !== 'string') return null;
  const dash = raw.indexOf('-');
  if (dash === -1) return null;
  const country = normalizeCountryCode(raw.slice(0, dash));
  const state = raw.slice(dash + 1).trim().toUpperCase();
  if (!country || state === '' || !isKnownState(country, state)) return null;
  return { country, state };
}

// ---------------------------------------------------------------------------------------------
// Scope resolution
// ---------------------------------------------------------------------------------------------

export function resolveHolidayScope(settings: PlannerSettings | null | undefined): HolidayScope {
  const countries: string[] = [];
  const rawCountries = settings?.holiday_countries;
  if (Array.isArray(rawCountries)) {
    for (const raw of rawCountries) {
      const code = normalizeCountryCode(raw);
      if (code && !countries.includes(code)) countries.push(code);
    }
  }
  if (countries.length === 0) countries.push(DEFAULT_COUNTRY);

  const regions: HolidayRegion[] = [];
  const rawRegions = settings?.holiday_regions;
  if (Array.isArray(rawRegions)) {
    for (const raw of rawRegions) {
      const region = normalizeRegionCode(raw);
      if (region && !regions.some((r) => r.country === region.country && r.state === region.state)) {
        regions.push(region);
      }
    }
  }

  return { countries, regions };
}

// ---------------------------------------------------------------------------------------------
// Holidays instances and per-year results, cached for the module lifetime
// ---------------------------------------------------------------------------------------------

const instances = new Map<string, Holidays>();
const yearCache = new Map<string, readonly HolidaysTypes.Holiday[]>();

function scopeKey(country: string, state: string | undefined): string {
  return state ? `${country}-${state}` : country;
}

/** English first, keeping the country's own English variant ahead of generic "en"; native after. */
function preferEnglish(hd: Holidays): void {
  const english = hd.getLanguages().filter((lang) => /^en(-|$)/i.test(lang));
  hd.setLanguages([...english, 'en']);
}

function instanceFor(country: string, state: string | undefined): Holidays {
  const key = scopeKey(country, state);
  let hd = instances.get(key);
  if (!hd) {
    hd = state ? new Holidays(country, state) : new Holidays(country);
    preferEnglish(hd);
    instances.set(key, hd);
  }
  return hd;
}

function holidaysInYear(country: string, state: string | undefined, year: number): readonly HolidaysTypes.Holiday[] {
  const key = `${scopeKey(country, state)}|${year}`;
  let list = yearCache.get(key);
  if (!list) {
    list = instanceFor(country, state).getHolidays(year);
    yearCache.set(key, list);
  }
  return list;
}

// ---------------------------------------------------------------------------------------------
// Range query
// ---------------------------------------------------------------------------------------------

/**
 * Whole days a holiday covers, counted from its nominal `date`. Rounding is deliberate (see the
 * module comment); anything shorter than half a day, or a span the library left unset, is one day.
 */
function spanDays(holiday: HolidaysTypes.Holiday): number {
  const days = Math.round((holiday.end.getTime() - holiday.start.getTime()) / DAY_MS);
  return days > 1 ? days : 1;
}

/**
 * `{ "2025-07-04": ["Independence Day"] }` for every day in [start, end] that has at least one
 * holiday of a kept type in the planner's scope; a multi-day holiday counts on each of its days.
 * Names are de-duplicated per date in encounter order (countries first, then regions, earlier
 * years first); keys are ascending.
 */
export function holidaysBetween(
  start: ISODate,
  end: ISODate,
  settings?: PlannerSettings | null,
  options?: HolidaysBetweenOptions,
): HolidayMap {
  assertISODate(start, 'start');
  assertISODate(end, 'end');
  const result: HolidayMap = {};
  if (compareISO(end, start) < 0) return result;

  const types = new Set(options?.types ?? DEFAULT_TYPES);
  const scope = resolveHolidayScope(settings);
  const sources: Array<{ country: string; state?: string }> = [
    ...scope.countries.map((country) => ({ country })),
    ...scope.regions.map(({ country, state }) => ({ country, state })),
  ];

  const byDate = new Map<ISODate, string[]>();
  const add = (date: ISODate, name: string): void => {
    const names = byDate.get(date);
    if (!names) byDate.set(date, [name]);
    else if (!names.includes(name)) names.push(name);
  };

  // From the year before the range: a span filed under December can reach into January.
  for (let year = yearOf(start) - 1; year <= yearOf(end); year++) {
    for (const source of sources) {
      for (const holiday of holidaysInYear(source.country, source.state, year)) {
        if (!types.has(holiday.type)) continue;
        // "YYYY-MM-DD hh:mm:ss [-hh:mm]"; a few rules start mid-day (Halloween 18:00) and
        // Islamic-calendar dates carry an offset, the calendar day is what counts.
        const first = holiday.date.slice(0, 10);
        const days = spanDays(holiday);
        const last = days === 1 ? first : addDays(first, days - 1);
        if (compareISO(last, start) < 0 || compareISO(first, end) > 0) continue;
        for (let i = 0; i < days; i++) {
          const date = i === 0 ? first : addDays(first, i);
          if (compareISO(date, start) < 0) continue;
          if (compareISO(date, end) > 0) break;
          add(date, holiday.name);
        }
      }
    }
  }

  for (const [date, names] of [...byDate.entries()].sort(([a], [b]) => compareISO(a, b))) {
    result[date] = names;
  }
  return result;
}
