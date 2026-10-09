import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMoonIllumination } from 'suncalc';
import { describe, expect, it } from 'vitest';
import { daysInclusive, type ISODate } from '../dates.ts';
import type { MoonPhaseMap, WeekDayData } from '../types.ts';
import {
  MOON_EMOJI,
  moonPhaseAt,
  moonPhaseForDate,
  moonPhaseName,
  moonPhases,
  type MoonPhaseName,
} from './moon.ts';

// ---------------------------------------------------------------------------------------------
// Golden fixtures captured from the Rust build (see ../__fixtures__/README.md)
// ---------------------------------------------------------------------------------------------

interface WeeklyFixture {
  variant: string;
  weekStart: string;
  request: { command: string; payload: Record<string, unknown> };
  response: {
    success: boolean;
    error?: string;
    data?: {
      weekData: {
        mainDates: ISODate[];
        moonPhases: MoonPhaseMap;
        templateData: WeekDayData[];
        lastDayData: WeekDayData;
      };
    };
  };
}

interface FixtureCase {
  name: string;
  fixture: WeeklyFixture;
}

const FIXTURES_DIR = fileURLToPath(new URL('../__fixtures__/', import.meta.url));

function loadWeeklyFixtures(): FixtureCase[] {
  const cases: FixtureCase[] = [];
  for (const variant of readdirSync(FIXTURES_DIR)) {
    const dir = join(FIXTURES_DIR, variant);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of readdirSync(dir)) {
      if (!file.startsWith('weekly_') || !file.endsWith('.json')) continue;
      const fixture = JSON.parse(readFileSync(join(dir, file), 'utf8')) as WeeklyFixture;
      cases.push({ name: `${variant}/${file}`, fixture });
    }
  }
  return cases;
}

const weeklyFixtures = loadWeeklyFixtures();
const successfulFixtures = weeklyFixtures.filter((c) => c.fixture.response.success && c.fixture.response.data);

/** A UTC instant from components, safe for years below 100 (which `Date.UTC` remaps to 19xx). */
const noonUTC = (y: number, m: number, d: number, h = 12, min = 0): Date => {
  const date = new Date(Date.UTC(2000, 0, 1, h, min, 0));
  date.setUTCFullYear(y, m - 1, d);
  return date;
};

/** Distance between two positions on the 0..1 cycle, so 0.99 and 0.01 are 0.02 apart. */
const cyclicDistance = (a: number, b: number): number => {
  const diff = Math.abs(a - b) % 1;
  return Math.min(diff, 1 - diff);
};

const CYCLE: readonly MoonPhaseName[] = [
  'new',
  'waxing crescent',
  'first quarter',
  'waxing gibbous',
  'full',
  'waning gibbous',
  'last quarter',
  'waning crescent',
];

const BLANK = { emoji: '', alt: '', aria_label: '' };
const labelled = (emoji: string) => ({ emoji, alt: `Moon phase: ${emoji}`, aria_label: `Moon phase: ${emoji}` });

describe('moon phases: parity with the Rust capture', () => {
  it('finds the golden weekly fixtures', () => {
    expect(successfulFixtures.length).toBeGreaterThan(0);
    for (const { fixture } of successfulFixtures) {
      expect(fixture.response.data?.weekData.mainDates).toHaveLength(7);
    }
  });

  it.each(successfulFixtures)('$name: moonPhases(mainDates) equals weekData.moonPhases', ({ fixture }) => {
    const week = fixture.response.data!.weekData;
    expect(moonPhases(week.mainDates)).toEqual(week.moonPhases);
  });

  it.each(successfulFixtures)('$name: templateData and lastDayData carry the map emoji', ({ fixture }) => {
    const week = fixture.response.data!.weekData;
    const map = moonPhases(week.mainDates);
    const rows = [...week.templateData, week.lastDayData];
    expect(rows.map((r) => r.entryDate)).toEqual(week.mainDates);
    for (const row of rows) {
      expect(row.moon_phase).toBe(map[row.entryDate].emoji);
      if (row.moon_phase !== '') {
        expect(row.moon_phase).toBe(MOON_EMOJI[moonPhaseForDate(row.entryDate).name]);
      }
    }
  });
});

describe('moonPhaseName thresholds', () => {
  it.each<[number, MoonPhaseName]>([
    [0, 'new'],
    [0.029, 'new'],
    [0.03, 'waxing crescent'],
    [0.199, 'waxing crescent'],
    [0.2, 'first quarter'],
    [0.299, 'first quarter'],
    [0.3, 'waxing gibbous'],
    [0.469, 'waxing gibbous'],
    [0.47, 'full'],
    [0.529, 'full'],
    [0.53, 'waning gibbous'],
    [0.699, 'waning gibbous'],
    [0.7, 'last quarter'],
    [0.849, 'last quarter'],
    [0.85, 'waning crescent'],
    [0.999, 'waning crescent'],
    [1, 'waning crescent'],
  ])('%f → %s', (phase, name) => {
    expect(moonPhaseName(phase)).toBe(name);
  });
});

describe('MOON_EMOJI', () => {
  it('maps the eight names, in cycle order, to U+1F311 … U+1F318', () => {
    expect(Object.keys(MOON_EMOJI)).toHaveLength(8);
    CYCLE.forEach((name, i) => {
      expect(MOON_EMOJI[name]).toBe(String.fromCodePoint(0x1f311 + i));
    });
    expect(MOON_EMOJI.new).toBe('🌑');
    expect(MOON_EMOJI.full).toBe('🌕');
    expect(MOON_EMOJI['waning crescent']).toBe('🌘');
    expect(Object.isFrozen(MOON_EMOJI)).toBe(true);
  });
});

describe('moonPhaseAt', () => {
  // UTC instants of real lunar events (USNO), to show the ephemeris is the genuine article. The
  // 1.x formulas are good to a few hours, so about 0.015 of a cycle.
  it.each([
    ['new moon', noonUTC(2025, 9, 21, 19, 54), 0],
    ['first quarter', noonUTC(2025, 9, 29, 23, 54), 0.25],
    ['full moon', noonUTC(2025, 10, 7, 3, 48), 0.5],
    ['last quarter', noonUTC(2025, 10, 13, 18, 13), 0.75],
    ['next new moon', noonUTC(2025, 10, 21, 12, 25), 0],
  ])('is within 0.015 of the almanac at the %s', (_label, instant, expected) => {
    const phase = moonPhaseAt(instant);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
    expect(cyclicDistance(phase, expected)).toBeLessThan(0.015);
  });

  it('agrees with the installed npm suncalc to within 0.03 on every fixture date', () => {
    // npm suncalc 2.x uses a different lunar series (Meeus ch. 47 with ΔT), so the two drift by up
    // to about 0.023 of a cycle. That is enough to flip a bucket on days near a boundary
    // (2025-10-01: 0.3010 here versus 0.2979 there), which is why the module keeps the 1.x
    // formulas the Rust crate used instead of calling the package. This check only guards the
    // inline port against a typo in a constant.
    const dates = new Set(successfulFixtures.flatMap((c) => c.fixture.response.data!.weekData.mainDates));
    expect(dates.size).toBeGreaterThan(0);
    for (const iso of dates) {
      const ours = moonPhaseForDate(iso).phase;
      const theirs = getMoonIllumination(fromISONoonUTC(iso)).phase;
      expect(cyclicDistance(ours, theirs)).toBeLessThan(0.03);
    }
  });
});

function fromISONoonUTC(iso: ISODate): Date {
  return noonUTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
}

describe('moonPhaseForDate', () => {
  it('samples 12:00 UTC of the calendar day, whatever the machine zone', () => {
    // A different hour of the same day gives a different phase, so an exact match pins the sample
    // to 12:00 UTC regardless of the zone vitest runs in.
    expect(moonPhaseForDate('2025-10-07').phase).toBe(moonPhaseAt(noonUTC(2025, 10, 7)));
    expect(moonPhaseForDate('2025-10-07').phase).not.toBe(moonPhaseAt(noonUTC(2025, 10, 7, 0)));
  });

  it('keeps a year below 100 in its own century', () => {
    // dates.ts accepts every four-digit year and chrono on the Rust side sampled year 99 as year
    // 99, but Date.UTC(99, ...) means 1999. The expected instants come from ISO strings, which the
    // Date parser does not remap, so the check is independent of how the module builds its own.
    const year99 = moonPhaseForDate('0099-01-01');
    expect(year99.phase).toBe(moonPhaseAt(new Date('0099-01-01T12:00:00.000Z')));
    expect(year99.phase).not.toBe(moonPhaseAt(new Date(Date.UTC(99, 0, 1, 12, 0, 0))));
    expect(year99.phase).not.toBe(moonPhaseForDate('1999-01-01').phase);
    expect(moonPhaseForDate('0000-01-01').phase).toBe(moonPhaseAt(new Date('0000-01-01T12:00:00.000Z')));
  });

  it('puts the known full moon of 2025-10-07 in the full bucket', () => {
    const full = moonPhaseForDate('2025-10-07');
    expect(full.phase).toBeGreaterThanOrEqual(0.47);
    expect(full.phase).toBeLessThan(0.53);
    expect(full.name).toBe('full');
    expect(full.emoji).toBe('🌕');
  });

  it.each<[ISODate, MoonPhaseName]>([
    ['2025-09-22', 'new'],
    ['2025-09-23', 'waxing crescent'],
    ['2025-09-30', 'first quarter'],
    ['2025-10-01', 'waxing gibbous'], // 0.30096: the date where npm suncalc 2.x lands on the other side of 0.30
    ['2025-10-08', 'waning gibbous'],
    ['2025-10-14', 'last quarter'],
    ['2025-10-21', 'waning crescent'],
  ])('%s is %s', (iso, name) => {
    const result = moonPhaseForDate(iso);
    expect(result.name).toBe(name);
    expect(result.emoji).toBe(MOON_EMOJI[name]);
    expect(moonPhaseName(result.phase)).toBe(name);
  });

  it('rejects anything that is not a real YYYY-MM-DD date', () => {
    expect(() => moonPhaseForDate('2025-13-01')).toThrow(/invalid date/);
    expect(() => moonPhaseForDate('2025-10-07T12:00:00Z')).toThrow(/invalid date/);
    expect(() => moonPhases(['2025-10-06', 'nope'])).toThrow(/invalid date/);
  });
});

describe('moonPhases', () => {
  it('returns {} for an empty list', () => {
    expect(moonPhases([])).toEqual({});
  });

  it('always labels the first date in a list, even mid-run', () => {
    // 2025-10-01 and 2025-10-02 are both waxing gibbous; alone, 10-02 still gets the emoji.
    for (const iso of ['2025-10-02', '2025-10-03', '2025-10-05', '2024-02-29', '2026-01-01']) {
      const single = moonPhases([iso]);
      const emoji = MOON_EMOJI[moonPhaseForDate(iso).name];
      expect(emoji).not.toBe('');
      expect(single).toEqual({ [iso]: labelled(emoji) });
    }
  });

  it('labels a date only when its phase name differs from the previous date in the list', () => {
    expect(moonPhases(['2025-10-01', '2025-10-02'])).toEqual({
      '2025-10-01': labelled('🌔'),
      '2025-10-02': BLANK,
    });
    expect(moonPhases(['2025-10-02'])).toEqual({ '2025-10-02': labelled('🌔') });

    // The same rule restated over four months: blank iff the name repeats.
    const dates = daysInclusive('2025-09-01', '2025-12-31');
    const map = moonPhases(dates);
    expect(Object.keys(map)).toEqual(dates);
    dates.forEach((iso, i) => {
      const { name } = moonPhaseForDate(iso);
      const changed = i === 0 || moonPhaseForDate(dates[i - 1]).name !== name;
      expect(map[iso]).toEqual(changed ? labelled(MOON_EMOJI[name]) : BLANK);
    });
  });

  it('walks the whole cycle across a lunar month starting at a new moon', () => {
    const dates = daysInclusive('2025-09-22', '2025-10-21');
    const map = moonPhases(dates);
    const changes = dates.filter((iso) => map[iso].emoji !== '').map((iso) => [iso, map[iso].emoji]);
    expect(changes).toEqual([
      ['2025-09-22', '🌑'],
      ['2025-09-23', '🌒'],
      ['2025-09-28', '🌓'],
      ['2025-10-01', '🌔'],
      ['2025-10-06', '🌕'],
      ['2025-10-08', '🌖'],
      ['2025-10-13', '🌗'],
      ['2025-10-17', '🌘'],
    ]);
  });

  it('keeps the requested order and emits every date exactly once', () => {
    const dates: ISODate[] = ['2025-10-05', '2025-10-04', '2025-10-03'];
    expect(Object.keys(moonPhases(dates))).toEqual(dates);
  });
});
