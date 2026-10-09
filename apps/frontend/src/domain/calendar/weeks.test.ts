import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { daysInclusive, weekdayIndexFromAbbr, type ISODate, type WeekdayIndex } from '../dates.ts';
import {
  formatWeekId,
  isoWeekMonday,
  normalizeWeek,
  parseWeekId,
  resolveWeek,
  weekIdForDate,
  weekNavigation,
  weekRange,
  weeksInYear,
  type WeekSide,
} from './weeks.ts';

// ---------------------------------------------------------------------------------------------
// Golden fixtures captured from the Rust implementation
// ---------------------------------------------------------------------------------------------

const FIXTURES_DIR = fileURLToPath(new URL('../__fixtures__/', import.meta.url));

/** Monday to Sunday: every value the week-start-day setting can take. */
const ALL_WEEK_STARTS: WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

/** The weekData fields this module is responsible for; the rest belong to the page builder. */
interface ComparedWeekData {
  weekNumber: number;
  year: number;
  side: WeekSide;
  mainDates: ISODate[];
  endDate: ISODate;
  weekStart: ISODate;
  weeksInYear: number;
  nextWeekId: string;
  prevWeekId: string;
}

interface WeeklyFixture {
  variant: string;
  weekStart: string;
  request: { command: string; payload: { planner_id: string; week_id?: string; month_id?: string } };
  response: { success: boolean; data?: { weekData: ComparedWeekData }; error?: string };
}

function compared(w: ComparedWeekData): ComparedWeekData {
  return {
    weekNumber: w.weekNumber,
    year: w.year,
    side: w.side,
    mainDates: w.mainDates,
    endDate: w.endDate,
    weekStart: w.weekStart,
    weeksInYear: w.weeksInYear,
    nextWeekId: w.nextWeekId,
    prevWeekId: w.prevWeekId,
  };
}

function loadWeeklyFixtures(): Array<{ name: string; fixture: WeeklyFixture }> {
  const out: Array<{ name: string; fixture: WeeklyFixture }> = [];
  for (const entry of readdirSync(FIXTURES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of readdirSync(join(FIXTURES_DIR, entry.name))) {
      if (!file.startsWith('weekly_') || !file.endsWith('.json')) continue;
      const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, entry.name, file), 'utf8')) as WeeklyFixture;
      out.push({ name: `${entry.name}/${file}`, fixture });
    }
  }
  return out;
}

const allFixtures = loadWeeklyFixtures();
const successful = allFixtures.filter(({ fixture }) => fixture.response.success);

describe('resolveWeek against the Rust golden fixtures', () => {
  it('finds fixtures in every variant folder', () => {
    expect(successful.length).toBeGreaterThan(0);
    const variants = new Set(successful.map(({ fixture }) => fixture.variant));
    expect([...variants].sort()).toEqual(['mon', 'sat', 'sun', 'thu']);
  });

  it.each(successful)('matches weekData of $name', ({ fixture }) => {
    const weekId = fixture.request.payload.week_id;
    if (weekId === undefined) throw new Error('weekly fixture without week_id');
    const resolved = resolveWeek(weekId, weekdayIndexFromAbbr(fixture.weekStart));
    expect(compared(resolved)).toEqual(compared(fixture.response.data!.weekData));
  });

  it.each(successful)('stores $name under the normalised id', ({ fixture }) => {
    const resolved = resolveWeek(fixture.request.payload.week_id!, weekdayIndexFromAbbr(fixture.weekStart));
    expect(resolved.normalizedWeekId).toBe(formatWeekId(resolved.weekNumber, resolved.year, resolved.side));
    expect(resolved.mainDates).toHaveLength(7);
    expect(resolved.mainDates[0]).toBe(resolved.weekStart);
    expect(resolved.mainDates[6]).toBe(resolved.endDate);
  });

  it.each(successful)('weekIdForDate maps every day of $name back to its page', ({ fixture }) => {
    const { weekNumber, year, side, mainDates } = fixture.response.data!.weekData;
    const weekStartIndex = weekdayIndexFromAbbr(fixture.weekStart);
    for (const iso of mainDates) {
      expect(weekIdForDate(iso, side, weekStartIndex)).toBe(formatWeekId(weekNumber, year, side));
    }
  });

  it('throws the same message the Rust side reported for mon/weekly_invalid.json', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, 'mon', 'weekly_invalid.json'), 'utf8')) as WeeklyFixture;
    expect(fixture.response.success).toBe(false);
    let message = '';
    try {
      parseWeekId(fixture.request.payload.week_id!);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toBe('invalid week_id format');
    // The Rust error carries a "Custom Error: " prefix from the IPC layer.
    expect(fixture.response.error).toContain(message);
  });
});

// ---------------------------------------------------------------------------------------------
// Unit behaviour
// ---------------------------------------------------------------------------------------------

describe('parseWeekId / formatWeekId', () => {
  it('parses one- and two-digit weeks with a side', () => {
    expect(parseWeekId('1_2025_l')).toEqual({ week: 1, year: 2025, side: 'l' });
    expect(parseWeekId('40_2025_r')).toEqual({ week: 40, year: 2025, side: 'r' });
    expect(parseWeekId('0_2025_l')).toEqual({ week: 0, year: 2025, side: 'l' });
  });

  it.each(['x_2025_l', '40_2025', '40_2025_x', '040_2025_l', '', '40_25_l', '40_2025_L', ' 40_2025_l'])(
    'rejects %j',
    (id) => {
      expect(() => parseWeekId(id)).toThrow('invalid week_id format');
    },
  );

  it('formats without zero padding', () => {
    expect(formatWeekId(1, 2026, 'l')).toBe('1_2026_l');
    expect(formatWeekId(53, 2026, 'r')).toBe('53_2026_r');
  });
});

describe('weeksInYear', () => {
  it.each([
    [2020, 53],
    [2024, 52],
    [2025, 52],
    [2026, 53],
    [2027, 52],
    [2015, 53],
    [2004, 53],
  ])('%i has %i ISO weeks', (year, weeks) => {
    expect(weeksInYear(year)).toBe(weeks);
  });
});

describe('normalizeWeek', () => {
  it('rolls week 0 back to the last week of the previous year', () => {
    expect(normalizeWeek(0, 2025)).toEqual({ week: 52, year: 2024, weeksInYear: 52 });
    expect(normalizeWeek(0, 2027)).toEqual({ week: 53, year: 2026, weeksInYear: 53 });
  });

  it('rolls a week past the end forward to week 1 of the next year', () => {
    expect(normalizeWeek(53, 2025)).toEqual({ week: 1, year: 2026, weeksInYear: 53 });
    expect(normalizeWeek(54, 2026)).toEqual({ week: 1, year: 2027, weeksInYear: 52 });
  });

  it('leaves valid weeks alone, including week 53 of a 53-week year', () => {
    expect(normalizeWeek(53, 2026)).toEqual({ week: 53, year: 2026, weeksInYear: 53 });
    expect(normalizeWeek(1, 2025)).toEqual({ week: 1, year: 2025, weeksInYear: 52 });
    expect(normalizeWeek(52, 2025)).toEqual({ week: 52, year: 2025, weeksInYear: 52 });
  });
});

describe('isoWeekMonday', () => {
  it('starts week 1 on the Monday of the week holding 4 January', () => {
    expect(isoWeekMonday(2025, 1)).toBe('2024-12-30');
    expect(isoWeekMonday(2026, 1)).toBe('2025-12-29');
    expect(isoWeekMonday(2027, 1)).toBe('2027-01-04');
    expect(isoWeekMonday(2021, 1)).toBe('2021-01-04');
  });

  it('steps seven days per week', () => {
    expect(isoWeekMonday(2025, 40)).toBe('2025-09-29');
    expect(isoWeekMonday(2020, 53)).toBe('2020-12-28');
    expect(isoWeekMonday(2026, 53)).toBe('2026-12-28');
  });
});

describe('weekRange', () => {
  it('uses the ISO Monday for a Monday start', () => {
    expect(weekRange(2025, 40, 0)).toEqual({
      start: '2025-09-29',
      end: '2025-10-05',
      dates: ['2025-09-29', '2025-09-30', '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05'],
    });
  });

  it('steps backwards from the ISO Monday to the start day', () => {
    // Sunday start: the Sunday BEFORE the ISO Monday.
    expect(weekRange(2025, 1, 6).start).toBe('2024-12-29');
    expect(weekRange(2025, 1, 6).end).toBe('2025-01-04');
    // Saturday start: two days back.
    expect(weekRange(2026, 1, 5).start).toBe('2025-12-27');
    // Thursday start: four days back.
    expect(weekRange(2025, 40, 3).start).toBe('2025-09-25');
    // Tuesday start: six days back, never one day forward.
    expect(weekRange(2025, 41, 1).start).toBe('2025-09-30');
  });

  it('always yields seven ascending dates', () => {
    const { start, end, dates } = weekRange(2024, 9, 6);
    expect(dates).toHaveLength(7);
    expect(dates[0]).toBe(start);
    expect(dates[6]).toBe(end);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe('weekNavigation', () => {
  it('moves left -> right within a week and right -> next week left', () => {
    expect(weekNavigation(40, 2025, 'l', 52)).toEqual({ nextWeekId: '40_2025_r', prevWeekId: '39_2025_r' });
    expect(weekNavigation(40, 2025, 'r', 52)).toEqual({ nextWeekId: '41_2025_l', prevWeekId: '40_2025_l' });
  });

  it('rolls into the next year after the last week', () => {
    expect(weekNavigation(52, 2025, 'r', 52).nextWeekId).toBe('1_2026_l');
    expect(weekNavigation(53, 2026, 'r', 53).nextWeekId).toBe('1_2027_l');
    expect(weekNavigation(53, 2026, 'r', 53).prevWeekId).toBe('53_2026_l');
  });

  it('rolls into the previous year before week 1, using the week count of that year', () => {
    expect(weekNavigation(1, 2027, 'l', 52).prevWeekId).toBe('53_2026_r');
    expect(weekNavigation(1, 2026, 'l', 53).prevWeekId).toBe('52_2025_r');
    expect(weekNavigation(1, 2027, 'l', 52).nextWeekId).toBe('1_2027_r');
  });
});

describe('weekIdForDate', () => {
  it('uses the ISO week-year, not the calendar year', () => {
    expect(weekIdForDate('2024-12-30')).toBe('1_2025_l');
    expect(weekIdForDate('2027-01-03')).toBe('53_2026_l');
    expect(weekIdForDate('2026-01-01')).toBe('1_2026_l');
    expect(weekIdForDate('2021-01-03')).toBe('53_2020_l');
  });

  it('defaults to the left side and accepts the right', () => {
    expect(weekIdForDate('2025-10-08')).toBe('41_2025_l');
    expect(weekIdForDate('2025-10-08', 'r')).toBe('41_2025_r');
  });

  it('is plain ISO for a Monday start, whether or not the index is passed', () => {
    for (const iso of daysInclusive('2024-12-01', '2027-01-31')) {
      expect(weekIdForDate(iso, 'l', 0)).toBe(weekIdForDate(iso));
    }
  });

  it('names the next page once the start day has moved the window past the date', () => {
    // Sunday start: page 1_2025 runs Sun 2024-12-29 .. Sat 2025-01-04, so Sunday 2025-01-05 is on
    // page 2_2025 although ISO still counts it as the last day of week 1.
    expect(weekIdForDate('2025-01-04', 'l', 6)).toBe('1_2025_l');
    expect(weekIdForDate('2025-01-05', 'l', 6)).toBe('2_2025_l');
    expect(resolveWeek('2_2025_l', 6).weekStart).toBe('2025-01-05');
    // Thursday start: page 41_2025 runs Thu 2025-10-02 .. Wed 2025-10-08.
    expect(weekIdForDate('2025-10-08', 'r', 3)).toBe('41_2025_r');
    expect(weekIdForDate('2025-10-09', 'r', 3)).toBe('42_2025_r');
    expect(resolveWeek('42_2025_r', 3).weekStart).toBe('2025-10-09');
  });

  it.each(ALL_WEEK_STARTS)('round-trips every day of 2025-2026 through resolveWeek with start index %i', (weekStartIndex) => {
    const misses = daysInclusive('2025-01-01', '2026-12-31').filter(
      (iso) => !resolveWeek(weekIdForDate(iso, 'l', weekStartIndex), weekStartIndex).mainDates.includes(iso),
    );
    expect(misses).toEqual([]);
  });
});

describe('resolveWeek', () => {
  it('reports the normalised id and the start index it was given', () => {
    expect(resolveWeek('0_2025_l', 0).normalizedWeekId).toBe('52_2024_l');
    expect(resolveWeek('53_2025_r', 0).normalizedWeekId).toBe('1_2026_r');
    expect(resolveWeek('54_2026_r', 0).normalizedWeekId).toBe('1_2027_r');
    expect(resolveWeek('53_2026_l', 0).normalizedWeekId).toBe('53_2026_l');
    expect(resolveWeek('40_2025_l', 6).weekStartIndex).toBe(6);
  });

  it('propagates the parse error', () => {
    expect(() => resolveWeek('bogus', 0)).toThrow('invalid week_id format');
  });
});
