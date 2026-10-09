import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ISODate } from '../dates.ts';
import { holidaysBetween, normalizeCountryCode, normalizeRegionCode, resolveHolidayScope } from './holidays.ts';

const US_ONLY = { countries: ['US'], regions: [] };

describe('resolveHolidayScope', () => {
  it('defaults to US when settings are missing, empty, or carry no usable code', () => {
    expect(resolveHolidayScope(undefined)).toEqual(US_ONLY);
    expect(resolveHolidayScope(null)).toEqual(US_ONLY);
    expect(resolveHolidayScope({})).toEqual(US_ONLY);
    expect(resolveHolidayScope({ holiday_countries: [] })).toEqual(US_ONLY);
    expect(resolveHolidayScope({ holiday_countries: ['xx'] })).toEqual(US_ONLY);
    expect(resolveHolidayScope({ holiday_countries: ['', '  ', 'zz'] })).toEqual(US_ONLY);
  });

  it('treats a non-array setting as missing', () => {
    expect(resolveHolidayScope({ holiday_countries: 'ru' as unknown as string[] })).toEqual(US_ONLY);
    expect(resolveHolidayScope({ holiday_regions: 'US-IL' as unknown as string[] })).toEqual(US_ONLY);
  });

  it('upper-cases, trims and keeps the order the form wrote', () => {
    expect(resolveHolidayScope({ holiday_countries: ['us', 'ru'] }).countries).toEqual(['US', 'RU']);
    expect(resolveHolidayScope({ holiday_countries: [' ru ', 'us'] }).countries).toEqual(['RU', 'US']);
  });

  it('maps the form\'s "uk" to GB, the code the library knows', () => {
    expect(resolveHolidayScope({ holiday_countries: ['uk'] }).countries).toEqual(['GB']);
  });

  it('drops unknown codes and non-strings, falling back to US only when nothing survives', () => {
    expect(resolveHolidayScope({ holiday_countries: ['xx', 'ru'] }).countries).toEqual(['RU']);
    expect(resolveHolidayScope({ holiday_countries: [42, null, 'gb'] as unknown as string[] }).countries).toEqual(['GB']);
  });

  it('de-duplicates countries after normalisation, preserving first position', () => {
    expect(resolveHolidayScope({ holiday_countries: ['gb', 'us', 'uk', 'GB', 'US'] }).countries).toEqual(['GB', 'US']);
  });

  it('accepts regions as CC-RR in any case and drops an unknown country or state', () => {
    expect(resolveHolidayScope({ holiday_regions: ['US-IL'] }).regions).toEqual([{ country: 'US', state: 'IL' }]);
    expect(resolveHolidayScope({ holiday_regions: ['us-il'] }).regions).toEqual([{ country: 'US', state: 'IL' }]);
    expect(resolveHolidayScope({ holiday_regions: ['US-ZZ'] }).regions).toEqual([]);
    expect(resolveHolidayScope({ holiday_regions: ['ZZ-IL'] }).regions).toEqual([]);
    expect(resolveHolidayScope({ holiday_regions: ['USIL', 'US-', '-IL', '', 7] as unknown as string[] }).regions).toEqual([]);
  });

  it('applies the UK alias to the country half of a region and de-duplicates regions', () => {
    expect(resolveHolidayScope({ holiday_regions: ['uk-sct', 'GB-SCT', 'US-IL', 'us-il'] }).regions).toEqual([
      { country: 'GB', state: 'SCT' },
      { country: 'US', state: 'IL' },
    ]);
  });

  it('does not add a region\'s country to the country list', () => {
    expect(resolveHolidayScope({ holiday_countries: ['ru'], holiday_regions: ['US-IL'] })).toEqual({
      countries: ['RU'],
      regions: [{ country: 'US', state: 'IL' }],
    });
  });

  it('leaves unrelated settings alone and does not need them', () => {
    const settings = { metadata: { default_styles: { 'week-start-day': 'Sun' } }, holiday_countries: ['us'] };
    expect(resolveHolidayScope(settings)).toEqual(US_ONLY);
    expect(settings.holiday_countries).toEqual(['us']);
  });
});

describe('normalizeCountryCode / normalizeRegionCode', () => {
  it('normalises the shapes a settings value can hold', () => {
    expect(normalizeCountryCode(' us ')).toBe('US');
    expect(normalizeCountryCode('uk')).toBe('GB');
    expect(normalizeCountryCode('xx')).toBeNull();
    expect(normalizeCountryCode('')).toBeNull();
    expect(normalizeCountryCode(undefined)).toBeNull();
    expect(normalizeRegionCode(' us - il ')).toEqual({ country: 'US', state: 'IL' });
    expect(normalizeRegionCode('US')).toBeNull();
    expect(normalizeRegionCode('US-IL-X')).toBeNull();
    expect(normalizeRegionCode(null)).toBeNull();
  });
});

describe('holidaysBetween', () => {
  it('reports the US federal holidays under the names the library uses', () => {
    const year = holidaysBetween('2025-01-01', '2025-12-31');
    expect(year['2025-07-04']).toContain('Independence Day');
    expect(year['2025-12-25']).toContain('Christmas Day');
    expect(year['2025-11-27']).toContain('Thanksgiving Day');
    expect(year['2025-01-01']).toContain("New Year's Day");
    // date-holidays lists Columbus Day as a national `public` holiday for the US (rule
    // "2nd monday in October"), so it appears with default settings. The Rust build showed it
    // too, through its merged state lists.
    expect(year['2025-10-13']).toEqual(['Columbus Day']);
    // The US's own English variant ("en-us") wins over generic English, hence not "Labour Day".
    expect(year['2025-09-01']).toEqual(['Labor Day']);
  });

  it('keeps only public holidays by default: optional days and observances are absent', () => {
    const year = holidaysBetween('2025-01-01', '2025-12-31');
    expect(year['2025-12-24']).toBeUndefined(); // Christmas Eve: optional
    expect(year['2025-12-31']).toBeUndefined(); // New Year's Eve: observance
    expect(year['2025-10-31']).toBeUndefined(); // Halloween: observance
    expect(Object.keys(year)).toEqual([
      '2025-01-01', '2025-01-20', '2025-02-17', '2025-05-26', '2025-06-19', '2025-07-04',
      '2025-09-01', '2025-10-13', '2025-11-11', '2025-11-27', '2025-12-25',
    ]);
  });

  it('returns an empty object for a week without holidays (the 40_2025 fixture week)', () => {
    expect(holidaysBetween('2025-09-29', '2025-10-05')).toEqual({});
  });

  it('honours the types option', () => {
    expect(holidaysBetween('2025-12-24', '2025-12-24', null, { types: ['optional'] })).toEqual({
      '2025-12-24': ['Christmas Eve'],
    });
    expect(holidaysBetween('2025-12-24', '2025-12-24', null, { types: ['public'] })).toEqual({});
    expect(holidaysBetween('2025-12-24', '2025-12-31', null, { types: ['public', 'optional', 'observance'] })).toEqual({
      '2025-12-24': ['Christmas Eve'],
      '2025-12-25': ['Christmas Day'],
      '2025-12-31': ["New Year's Eve"],
    });
    expect(holidaysBetween('2025-01-01', '2025-12-31', null, { types: [] })).toEqual({});
  });

  it('adds Russian public holidays for the settings the create-planner form writes', () => {
    const jan = holidaysBetween('2025-01-01', '2025-01-31', { holiday_countries: ['us', 'ru'] });
    // Orthodox Christmas, with the library's English name rather than the Cyrillic default.
    expect(jan['2025-01-07']).toEqual(['Christmas Day']);
    // The New Year holiday is one library entry (rule "01-02 P5D") covering five days, plus a
    // separate entry on the 8th; the Rust build listed every day and so does the port.
    for (const date of ['2025-01-02', '2025-01-03', '2025-01-04', '2025-01-05', '2025-01-06', '2025-01-08']) {
      expect(jan[date], date).toEqual(['New Year Holiday']);
    }
    expect(jan['2025-01-09']).toBeUndefined();
    // Both countries call 2025-01-01 "New Year's Day": one entry, not two.
    expect(jan['2025-01-01']).toEqual(["New Year's Day"]);
    expect(jan['2025-01-20']).toEqual(['Martin Luther King Jr. Day']);
  });

  it('reports a multi-day holiday on every day it covers, clipped to the range', () => {
    // A range starting after the holiday's first day found nothing while the map was keyed by
    // the library's `date` alone.
    expect(holidaysBetween('2025-01-03', '2025-01-06', { holiday_countries: ['ru'] })).toEqual({
      '2025-01-03': ['New Year Holiday'],
      '2025-01-04': ['New Year Holiday'],
      '2025-01-05': ['New Year Holiday'],
      '2025-01-06': ['New Year Holiday'],
    });
    expect(holidaysBetween('2025-01-04', '2025-01-04', { holiday_countries: ['ru'] })).toEqual({
      '2025-01-04': ['New Year Holiday'],
    });
    // Korean New Year, rule "korean 01-0-01 P3D".
    expect(holidaysBetween('2025-01-27', '2025-02-01', { holiday_countries: ['kr'] })).toEqual({
      '2025-01-29': ['Korean New Year'],
      '2025-01-30': ['Korean New Year'],
      '2025-01-31': ['Korean New Year'],
    });
  });

  it('de-duplicates a multi-day holiday that arrives from both a country and one of its regions', () => {
    const settings = { holiday_countries: ['ru'], holiday_regions: ['RU-TA'] };
    expect(holidaysBetween('2025-01-02', '2025-01-06', settings)).toEqual({
      '2025-01-02': ['New Year Holiday'],
      '2025-01-03': ['New Year Holiday'],
      '2025-01-04': ['New Year Holiday'],
      '2025-01-05': ['New Year Holiday'],
      '2025-01-06': ['New Year Holiday'],
    });
  });

  it("anchors a span on the holiday's nominal date, not the library's evening-before start", () => {
    // Islamic-calendar entries begin at 18:00 the previous day: Laylat al-Mi'raj has `date`
    // 2025-01-27 and `start` on the 26th, and must not be reported on the 26th.
    expect(holidaysBetween('2025-01-25', '2025-01-28', { holiday_countries: ['ae'] })).toEqual({
      '2025-01-27': ["Laylat al-Mi'raj"],
    });
  });

  it('rounds a fractional span to whole days: a "PT90H" Eid is four days, a half-day holiday is one', () => {
    // Turkey's rule "1 Shawwal PT90H" runs from 18:00 on 03-29 to noon on 04-02: 03-30 through
    // 04-02, never 03-29.
    expect(holidaysBetween('2025-03-28', '2025-04-03', { holiday_countries: ['tr'] })).toEqual({
      '2025-03-30': ['End of Ramadan (Eid al-Fitr)'],
      '2025-03-31': ['End of Ramadan (Eid al-Fitr)'],
      '2025-04-01': ['End of Ramadan (Eid al-Fitr)'],
      '2025-04-02': ['End of Ramadan (Eid al-Fitr)'],
    });
    // Iceland's Christmas Eve is a public holiday from 13:00 (rule "12-24 13:00").
    expect(holidaysBetween('2025-12-23', '2025-12-25', { holiday_countries: ['is'] })).toEqual({
      '2025-12-24': ['Christmas Eve'],
      '2025-12-25': ['Christmas Day'],
    });
  });

  it('carries a span across New Year although the library files it under the earlier year', () => {
    // Eswatini's Incwala Festival, rule "12-28 P6D", is returned by getHolidays(2025) only; a
    // January range still has to see its last two days.
    expect(holidaysBetween('2026-01-01', '2026-01-04', { holiday_countries: ['sz'] })).toEqual({
      '2026-01-01': ['Incwala Festival', "New Year's Day"],
      '2026-01-02': ['Incwala Festival'],
    });
    expect(holidaysBetween('2025-12-27', '2026-01-04', { holiday_countries: ['sz'] })).toEqual({
      '2025-12-28': ['Incwala Festival'],
      '2025-12-29': ['Incwala Festival'],
      '2025-12-30': ['Incwala Festival'],
      '2025-12-31': ['Incwala Festival'],
      '2026-01-01': ['Incwala Festival', "New Year's Day"],
      '2026-01-02': ['Incwala Festival'],
    });
    expect(holidaysBetween('2026-01-03', '2026-01-04', { holiday_countries: ['sz'] })).toEqual({});
  });

  it('maps uk to GB: Boxing Day, and no US holidays', () => {
    expect(holidaysBetween('2025-12-26', '2025-12-26', { holiday_countries: ['uk'] })).toEqual({
      '2025-12-26': ['Boxing Day'],
    });
    expect(holidaysBetween('2025-07-04', '2025-07-04', { holiday_countries: ['uk'] })).toEqual({});
  });

  it('falls back to US when no listed code is known', () => {
    expect(holidaysBetween('2025-07-04', '2025-07-04', { holiday_countries: ['xx'] })).toEqual({
      '2025-07-04': ['Independence Day'],
    });
  });

  it('adds Illinois-only public holidays for the US-IL region', () => {
    const settings = { holiday_countries: ['us'], holiday_regions: ['US-IL'] };
    const illinois = holidaysBetween('2025-01-01', '2025-12-31', settings);
    expect(illinois['2025-02-12']).toEqual(["Lincoln's Birthday"]);
    expect(illinois['2025-03-03']).toEqual(['Casimir Pulaski Day']);
    const national = holidaysBetween('2025-01-01', '2025-12-31', { holiday_countries: ['us'] });
    expect(national['2025-02-12']).toBeUndefined();
    expect(national['2025-03-03']).toBeUndefined();
  });

  it('ignores a region with an unknown state or country', () => {
    const national = holidaysBetween('2025-01-01', '2025-12-31');
    expect(holidaysBetween('2025-01-01', '2025-12-31', { holiday_regions: ['US-ZZ'] })).toEqual(national);
    expect(holidaysBetween('2025-01-01', '2025-12-31', { holiday_regions: ['ZZ-IL'] })).toEqual(national);
  });

  it('a region brings its country\'s national holidays even when that country is not listed', () => {
    const settings = { holiday_countries: ['ru'], holiday_regions: ['US-IL'] };
    expect(holidaysBetween('2025-07-04', '2025-07-04', settings)).toEqual({ '2025-07-04': ['Independence Day'] });
  });

  it('de-duplicates a name that arrives from both the country and one of its regions', () => {
    expect(holidaysBetween('2025-07-04', '2025-07-04', { holiday_countries: ['us'], holiday_regions: ['US-IL'] })).toEqual({
      '2025-07-04': ['Independence Day'],
    });
    expect(holidaysBetween('2025-12-25', '2025-12-25', { holiday_countries: ['us', 'gb'], holiday_regions: ['US-IL'] })).toEqual({
      '2025-12-25': ['Christmas Day'],
    });
  });

  it('spans a year boundary: the 1_2026 fixture week', () => {
    expect(holidaysBetween('2025-12-29', '2026-01-04')).toEqual({ '2026-01-01': ["New Year's Day"] });
  });

  it('includes substitute days the library files under the year they are observed in', () => {
    // 2028-01-01 is a Saturday; the federal observance is Friday 2027-12-31, reported under 2027,
    // so a range that never touches 2028 still sees it.
    expect(holidaysBetween('2027-12-27', '2027-12-31')).toEqual({
      '2027-12-31': ["New Year's Day (substitute day)"],
    });
    expect(holidaysBetween('2026-07-01', '2026-07-05')).toEqual({
      '2026-07-03': ['Independence Day (substitute day)'],
      '2026-07-04': ['Independence Day'],
    });
  });

  it('returns keys in ascending order whatever order the sources produced them in', () => {
    const map = holidaysBetween('2025-11-01', '2026-01-31', { holiday_countries: ['us', 'ru'] });
    const keys = Object.keys(map);
    expect(keys).toEqual([...keys].sort());
    // Russia's Unity Day precedes US Veterans Day although Russia was gathered second.
    expect(keys[0]).toBe('2025-11-04');
    expect(keys).toContain('2025-11-11');
    expect(keys).toContain('2026-01-01');
    expect(keys[keys.length - 1]).toBe('2026-01-19');
  });

  it('returns an empty object when end precedes start, and throws on malformed dates', () => {
    expect(holidaysBetween('2025-07-05', '2025-07-04')).toEqual({});
    expect(() => holidaysBetween('2025-7-4', '2025-07-05')).toThrow(/invalid start/);
    expect(() => holidaysBetween('2025-07-04', '2025-02-30')).toThrow(/invalid end/);
  });

  it('hands out a fresh result each call, so callers may mutate it', () => {
    const first = holidaysBetween('2025-07-04', '2025-07-04');
    first['2025-07-04'].push('mutated');
    expect(holidaysBetween('2025-07-04', '2025-07-04')).toEqual({ '2025-07-04': ['Independence Day'] });
  });
});

// ---------------------------------------------------------------------------------------------
// Soft parity with the Rust fixtures. The Rust build merged every US subdivision, so its key set
// should be a superset of ours; the two libraries' data differ, so this is informational.
// ---------------------------------------------------------------------------------------------

interface WeeklyFixture {
  variant: string;
  weekStart: string;
  response: {
    success: boolean;
    data?: { weekData: { mainDates: ISODate[]; holidays: Record<string, string[]> } };
    error?: string;
  };
}

const monDir = fileURLToPath(new URL('../__fixtures__/mon/', import.meta.url));
const monWeeklyFixtures = readdirSync(monDir)
  .filter((name) => name.startsWith('weekly_') && name.endsWith('.json'))
  .sort()
  .flatMap((name) => {
    const fixture = JSON.parse(readFileSync(join(monDir, name), 'utf8')) as WeeklyFixture;
    const weekData = fixture.response.data?.weekData;
    return fixture.response.success && weekData ? [{ name, weekData }] : [];
  });

describe('parity with the Rust fixtures (informational)', () => {
  it('finds the successful mon fixtures', () => {
    expect(monWeeklyFixtures.length).toBeGreaterThan(0);
  });

  it.each(monWeeklyFixtures)('$name: every date the port reports is one the Rust build reported', ({ weekData }) => {
    const { mainDates, holidays } = weekData;
    const ours = holidaysBetween(mainDates[0], mainDates[6]);
    const drift = Object.keys(ours).filter((date) => !(date in holidays));
    // Soft so a data difference lists every offending date rather than stopping at the first.
    expect.soft(drift, `dates the port reports for ${mainDates[0]}..${mainDates[6]} that the Rust fixture lacks`).toEqual([]);
  });
});
