import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { daysInMonth, firstOfMonth, weekdayIndex, weekdayIndexFromAbbr } from '../dates.ts';
import type { WeekdayIndex } from '../dates.ts';
import type { WeekData } from '../types.ts';
import { GRID_CELLS, calendarsForWeek, daysOrder, monthGrid } from './grids.ts';

// ---------------------------------------------------------------------------------------------
// Golden fixtures captured from the Rust implementation, one folder per week-start variant.
// Read with fs rather than import so a single it.each can walk every file.
// ---------------------------------------------------------------------------------------------

interface WeeklyFixture {
  variant: string;
  weekStart: string;
  request: { command: string; payload: { planner_id: string; week_id?: string; month_id?: string } };
  response: { success: boolean; data?: { weekData: WeekData }; error?: string };
}

interface WeeklyCase {
  name: string;
  variant: string;
  weekStart: string;
  weekData: WeekData;
}

const FIXTURES_DIR = fileURLToPath(new URL('../__fixtures__/', import.meta.url));

function loadSuccessfulWeeklyFixtures(): WeeklyCase[] {
  const cases: WeeklyCase[] = [];
  for (const entry of readdirSync(FIXTURES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const folder = join(FIXTURES_DIR, entry.name);
    for (const file of readdirSync(folder).sort()) {
      if (!file.startsWith('weekly_') || !file.endsWith('.json')) continue;
      const fixture = JSON.parse(readFileSync(join(folder, file), 'utf8')) as WeeklyFixture;
      if (!fixture.response.success || !fixture.response.data) continue;
      cases.push({
        name: `${entry.name}/${file}`,
        variant: entry.name,
        weekStart: fixture.weekStart,
        weekData: fixture.response.data.weekData,
      });
    }
  }
  return cases;
}

const weeklyCases = loadSuccessfulWeeklyFixtures();

const ALL_KEYS = Array.from({ length: GRID_CELLS }, (_, i) => String(i + 1));
const ALL_STARTS: readonly WeekdayIndex[] = [0, 1, 2, 3, 4, 5, 6];

/** Cell values in key order "1".."42". */
function cells(grid: { buttonData: Record<string, number> }): number[] {
  return ALL_KEYS.map((k) => grid.buttonData[k]);
}

describe('fixture parity', () => {
  it('finds successful weekly fixtures in more than one week-start variant', () => {
    expect(weeklyCases.length).toBeGreaterThan(0);
    expect(new Set(weeklyCases.map((c) => c.variant)).size).toBeGreaterThan(1);
  });

  it.each(weeklyCases)('$name: the folder name agrees with the fixture weekStart', ({ variant, weekStart }) => {
    // The parity assertions key off fixture.weekStart; make sure it really is the capture variant.
    expect(weekStart.toLowerCase()).toBe(variant.toLowerCase());
  });

  it.each(weeklyCases)('$name: daysOrder matches the Rust output', ({ weekStart, weekData }) => {
    expect(daysOrder(weekdayIndexFromAbbr(weekStart))).toEqual(weekData.daysOrder);
  });

  it.each(weeklyCases)('$name: calendars match the Rust output exactly', ({ weekStart, weekData }) => {
    expect(calendarsForWeek(weekData.endDate, weekdayIndexFromAbbr(weekStart))).toEqual({
      leftCalendar: weekData.leftCalendar,
      rightCalendar: weekData.rightCalendar,
      currentMonthName: weekData.currentMonthName,
    });
  });
});

describe('daysOrder', () => {
  it('rotates the Monday-indexed letters to start at the week-start day', () => {
    expect(daysOrder(0)).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(daysOrder(3)).toEqual(['T', 'F', 'S', 'S', 'M', 'T', 'W']);
    expect(daysOrder(5)).toEqual(['S', 'S', 'M', 'T', 'W', 'T', 'F']);
    expect(daysOrder(6)).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  });

  it('returns a fresh array on every call', () => {
    const first = daysOrder(0);
    first[0] = 'X';
    expect(daysOrder(0)[0]).toBe('M');
  });
});

describe('monthGrid', () => {
  it('February 2026 with a Sunday start: no leading blanks, 28 days, 14 trailing zeros', () => {
    const grid = monthGrid(2026, 2, 6);
    expect(grid.month).toBe('February 2026');
    expect(Object.keys(grid.buttonData)).toEqual(ALL_KEYS);
    expect(cells(grid)).toEqual([
      ...Array.from({ length: 28 }, (_, i) => i + 1),
      ...new Array<number>(14).fill(0),
    ]);
  });

  it('a 31-day month whose 1st is the day before the week start gets six leading blanks', () => {
    // March 2026 starts on a Sunday; Monday start.
    const monday = cells(monthGrid(2026, 3, 0));
    expect(monday.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(monday[36]).toBe(31);
    expect(monday.slice(37)).toEqual([0, 0, 0, 0, 0]);

    // October 2025 starts on a Wednesday; Thursday start.
    const thursday = cells(monthGrid(2025, 10, 3));
    expect(thursday.slice(0, 7)).toEqual([0, 0, 0, 0, 0, 0, 1]);
    expect(thursday[36]).toBe(31);
  });

  it('every grid has exactly the keys "1".."42", each day once, contiguous, in the right column', () => {
    for (const year of [2023, 2024, 2025, 2026, 2027, 2028]) {
      for (let month = 1; month <= 12; month++) {
        for (const start of ALL_STARTS) {
          const grid = monthGrid(year, month, start);
          expect(Object.keys(grid.buttonData)).toEqual(ALL_KEYS);

          const values = cells(grid);
          const days = values.filter((v) => v !== 0);
          expect(days).toEqual(Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1));

          // Days occupy one contiguous run starting at the column of the 1st's weekday.
          const leading = values.indexOf(1);
          expect(values.slice(leading, leading + days.length)).toEqual(days);
          expect((start + leading) % 7).toBe(weekdayIndex(firstOfMonth(year, month)));
          expect(leading).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it('labels the month in fixed English', () => {
    expect(monthGrid(2025, 12, 0).month).toBe('December 2025');
    expect(monthGrid(2024, 1, 6).month).toBe('January 2024');
  });

  it('rejects an invalid month', () => {
    expect(() => monthGrid(2025, 0, 0)).toThrow();
    expect(() => monthGrid(2025, 13, 0)).toThrow();
  });
});

describe('calendarsForWeek', () => {
  it('shows the end month on the left and the following month on the right', () => {
    const result = calendarsForWeek('2025-10-05', 0);
    expect(result.currentMonthName).toBe('October');
    expect(result.leftCalendar).toEqual(monthGrid(2025, 10, 0));
    expect(result.rightCalendar).toEqual(monthGrid(2025, 11, 0));
  });

  it('a week straddling a month boundary belongs to the month it ends in', () => {
    // Thursday-start week 2025-09-25 .. 2025-10-01.
    const result = calendarsForWeek('2025-10-01', 3);
    expect(result.currentMonthName).toBe('October');
    expect(result.leftCalendar.month).toBe('October 2025');
    expect(result.rightCalendar.month).toBe('November 2025');
  });

  it('rolls December into January of the next year', () => {
    const result = calendarsForWeek('2025-12-28', 6);
    expect(result.currentMonthName).toBe('December');
    expect(result.leftCalendar.month).toBe('December 2025');
    expect(result.rightCalendar).toEqual(monthGrid(2026, 1, 6));
  });

  it('rejects a malformed end date', () => {
    expect(() => calendarsForWeek('2025-10-5', 0)).toThrow();
    expect(() => calendarsForWeek('2025-02-30', 0)).toThrow();
  });
});
