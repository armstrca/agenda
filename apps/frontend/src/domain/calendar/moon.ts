/**
 * Moon phases for the planner's day cells.
 *
 * Why the ephemeris is inline instead of `suncalc` from npm: the golden fixtures were captured from
 * the Rust build, whose `suncalc` crate (0.4.0) is a line-for-line port of suncalc 1.x's
 * low-precision lunar formulas (aa.quae.nl). The npm 2.x line, which is what yarn resolved,
 * rewrote the lunar series (Meeus ch. 47 plus a ΔT correction). The two agree only to about 0.023
 * of a cycle, which flips the phase bucket on roughly 2% of days; in the fixtures that is
 * 2025-10-01 (0.30096 here, 0.29794 in 2.1.1, against the 0.30 boundary). Exact parity therefore
 * needs the same formulas, and keeping them here also means the emoji on a given day never change
 * because a dependency bumped. `getMoonIllumination(instant).phase` from suncalc@1.9.x is a
 * drop-in replacement for `moonPhaseAt` should the package ever be pinned to that line.
 *
 * Semantics preserved from the Rust side:
 *   - A day is sampled at 12:00 UTC of that calendar day, independent of the machine's zone, so
 *     the label reflects the phase for most of the day everywhere.
 *
 * Deliberate departure from the Rust side (which labelled the first day of every requested list,
 * so the same date could be "" on one page and "🌔" on another): whether a date shows its emoji
 * depends on the calendar alone, so the daily, weekly and monthly pages always agree.
 *   - A date can only show the emoji if its phase name differs from the previous calendar day's.
 *   - No two consecutive days both show one. The narrow buckets (new, quarters, full) can last a
 *     single day, so two changes can land back to back; the first of such a run shows, the next is
 *     blank, the one after that may show again, and so on (1st, 3rd, … day of the run).
 */

import { addDays, dayOf, monthOf, yearOf, type ISODate } from '../dates.ts';
import type { MoonPhaseMap } from '../types.ts';

export type MoonPhaseName =
  | 'new'
  | 'waxing crescent'
  | 'first quarter'
  | 'waxing gibbous'
  | 'full'
  | 'waning gibbous'
  | 'last quarter'
  | 'waning crescent';

export const MOON_EMOJI: Readonly<Record<MoonPhaseName, string>> = Object.freeze({
  'new': '🌑',
  'waxing crescent': '🌒',
  'first quarter': '🌓',
  'waxing gibbous': '🌔',
  'full': '🌕',
  'waning gibbous': '🌖',
  'last quarter': '🌗',
  'waning crescent': '🌘',
});

export interface MoonPhase {
  /** Position in the lunar cycle, 0 ≤ phase < 1: 0 new, 0.25 first quarter, 0.5 full. */
  phase: number;
  name: MoonPhaseName;
  emoji: string;
}

/**
 * Upper bounds (exclusive) in cycle order. The buckets are deliberately uneven: the four named
 * instants (new, quarters, full) get narrow windows so their emoji show for only a day or two.
 */
const PHASE_BOUNDS: ReadonlyArray<readonly [number, MoonPhaseName]> = [
  [0.03, 'new'],
  [0.2, 'waxing crescent'],
  [0.3, 'first quarter'],
  [0.47, 'waxing gibbous'],
  [0.53, 'full'],
  [0.7, 'waning gibbous'],
  [0.85, 'last quarter'],
];

export function moonPhaseName(phase: number): MoonPhaseName {
  for (const [bound, name] of PHASE_BOUNDS) {
    if (phase < bound) return name;
  }
  return 'waning crescent';
}

// ---------------------------------------------------------------------------------------------
// Ephemeris (suncalc 1.x / Rust suncalc 0.4.0 `moon_illumination`)
// ---------------------------------------------------------------------------------------------

const { PI, sin, cos, tan, asin, acos, atan2 } = Math;
const RAD = PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2_440_588;
const J2000 = 2_451_545;
/** Obliquity of the ecliptic. */
const OBLIQUITY = RAD * 23.4397;
/** Longitude of the Earth's perihelion. */
const PERIHELION = RAD * 102.9372;
const SUN_DISTANCE_KM = 149_598_000;

interface EquatorialCoords {
  /** Right ascension, radians. */
  ra: number;
  /** Declination, radians. */
  dec: number;
}

/** Days since the J2000.0 epoch, the time variable of every series below. */
function daysSinceJ2000(instant: Date): number {
  return instant.valueOf() / DAY_MS - 0.5 + J1970 - J2000;
}

function rightAscension(l: number, b: number): number {
  return atan2(sin(l) * cos(OBLIQUITY) - tan(b) * sin(OBLIQUITY), cos(l));
}

function declination(l: number, b: number): number {
  return asin(sin(b) * cos(OBLIQUITY) + cos(b) * sin(OBLIQUITY) * sin(l));
}

function sunCoords(d: number): EquatorialCoords {
  const M = RAD * (357.5291 + 0.98560028 * d); // mean anomaly
  const C = RAD * (1.9148 * sin(M) + 0.02 * sin(2 * M) + 0.0003 * sin(3 * M)); // equation of centre
  const L = M + C + PERIHELION + PI; // ecliptic longitude
  return { ra: rightAscension(L, 0), dec: declination(L, 0) };
}

function moonCoords(d: number): EquatorialCoords & { distanceKm: number } {
  const L = RAD * (218.316 + 13.176396 * d); // ecliptic longitude
  const M = RAD * (134.963 + 13.064993 * d); // mean anomaly
  const F = RAD * (93.272 + 13.22935 * d); // mean distance (argument of latitude)
  const l = L + RAD * 6.289 * sin(M);
  const b = RAD * 5.128 * sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), distanceKm: 385001 - 20905 * cos(M) };
}

/**
 * Position in the lunar cycle at an instant: 0 new, 0.25 first quarter, 0.5 full, 0.75 last
 * quarter, approaching 1 just before the next new moon. Accurate to a few hours, which is all the
 * day-level buckets need.
 */
export function moonPhaseAt(instant: Date): number {
  const d = daysSinceJ2000(instant);
  const s = sunCoords(d);
  const m = moonCoords(d);
  // Geocentric elongation of the Moon from the Sun.
  const phi = acos(sin(s.dec) * sin(m.dec) + cos(s.dec) * cos(m.dec) * cos(s.ra - m.ra));
  // Phase angle (Sun-Moon-Earth), with the Sun's distance making the triangle solvable.
  const inc = atan2(SUN_DISTANCE_KM * sin(phi), m.distanceKm - SUN_DISTANCE_KM * cos(phi));
  // Position angle of the bright limb; its sign says whether the Moon is waxing or waning.
  const angle = atan2(
    cos(s.dec) * sin(s.ra - m.ra),
    sin(s.dec) * cos(m.dec) - cos(s.dec) * sin(m.dec) * cos(s.ra - m.ra),
  );
  return 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI;
}

/**
 * 12:00:00 UTC of the calendar day, built from components so the machine zone plays no part.
 * Set via `setUTCFullYear` rather than `Date.UTC(year, ...)`, which remaps years 0..99 to
 * 1900..1999: dates.ts accepts every four-digit year, and chrono on the Rust side sampled year 99
 * as year 99.
 */
function noonUTC(iso: ISODate): Date {
  const d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
  d.setUTCFullYear(yearOf(iso), monthOf(iso) - 1, dayOf(iso));
  return d;
}

export function moonPhaseForDate(iso: ISODate): MoonPhase {
  const phase = moonPhaseAt(noonUTC(iso));
  const name = moonPhaseName(phase);
  return { phase, name, emoji: MOON_EMOJI[name] };
}

/**
 * Whether `iso` shows its moon emoji: its phase name differs from the previous calendar day's,
 * and it is an odd-numbered day of a run of such consecutive changes (so the day before it does
 * not show one). See the module header.
 */
export function showsMoonPhase(
  iso: ISODate,
  nameOf: (iso: ISODate) => MoonPhaseName = (d) => moonPhaseForDate(d).name,
): boolean {
  let run = 0;
  let day = iso;
  let name = nameOf(day);
  for (;;) {
    const previousDay = addDays(day, -1);
    const previousName = nameOf(previousDay);
    if (previousName === name) break;
    run++;
    day = previousDay;
    name = previousName;
  }
  return run % 2 === 1;
}

/**
 * Per-date moon info for a list of dates, in the given order. A date carries its emoji only when
 * `showsMoonPhase` says so, whatever else is in the list; otherwise all three fields are "".
 */
export function moonPhases(dates: readonly ISODate[]): MoonPhaseMap {
  const names = new Map<ISODate, MoonPhaseName>();
  const nameOf = (iso: ISODate): MoonPhaseName => {
    let name = names.get(iso);
    if (name === undefined) {
      name = moonPhaseForDate(iso).name;
      names.set(iso, name);
    }
    return name;
  };
  const out: MoonPhaseMap = {};
  for (const date of dates) {
    if (showsMoonPhase(date, nameOf)) {
      const emoji = MOON_EMOJI[nameOf(date)];
      const label = `Moon phase: ${emoji}`;
      out[date] = { emoji, alt: label, aria_label: label };
    } else {
      out[date] = { emoji: '', alt: '', aria_label: '' };
    }
  }
  return out;
}
