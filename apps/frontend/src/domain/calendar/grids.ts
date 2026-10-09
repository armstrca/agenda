/**
 * Mini month calendars and the weekday header for the right-hand weekly page.
 *
 * Why the shapes look the way they do:
 *   - Every grid is a fixed 6x7 = 42 cells keyed "1".."42" because the template addresses its
 *     day buttons by that id and renders every cell. A month never needs more than six rows
 *     (31 days behind six blanks is 37 cells), so the unused cells are filled with 0 (= blank)
 *     rather than left out. The Rust port emitted exactly this map and the parity fixtures
 *     assert it cell for cell.
 *   - The weekday header is seven single letters starting from the planner's week-start day.
 *     Tuesday and Thursday are both "T", Saturday and Sunday both "S"; that duplication is what
 *     the template shows and is not a bug.
 *   - The "left" calendar is the month containing the END of the week, not the start, so a week
 *     that straddles a month boundary shows the month it finishes in, with the following month on
 *     the right. `currentMonthName` is that same end month, for the page header.
 *   - Leading blanks are (weekday of the 1st - week start) mod 7, both Monday-indexed, so the 1st
 *     lands in the column of its weekday whatever the week-start setting.
 *
 * Pure functions over ISODate strings; all date arithmetic goes through ../dates.ts.
 */

import {
  daysInMonth,
  firstOfMonth,
  monthName,
  monthNameOf,
  monthOf,
  nextMonth,
  weekdayIndex,
  yearOf,
} from '../dates.ts';
import type { ISODate, WeekdayIndex } from '../dates.ts';
import type { CalendarMonthData, WeekData } from '../types.ts';

/** Monday-indexed, matching `WeekdayIndex`. */
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** 6 rows x 7 columns. */
export const GRID_CELLS = 42;

/** The calendar-related slice of `WeekData`, as `calendarsForWeek` produces it. */
export type WeekCalendars = Pick<WeekData, 'leftCalendar' | 'rightCalendar' | 'currentMonthName'>;

/** Seven single letters starting from the week-start day, e.g. Thursday → ["T","F","S","S","M","T","W"]. */
export function daysOrder(weekStartIndex: WeekdayIndex): string[] {
  return DAY_LETTERS.map((_, i) => DAY_LETTERS[(weekStartIndex + i) % 7]);
}

/**
 * The 42-cell grid for one month. `month` is 1-based; an invalid month throws.
 * Cells hold the day number, or 0 for the leading blanks before the 1st and the trailing blanks
 * after the last day.
 */
export function monthGrid(year: number, month: number, weekStartIndex: WeekdayIndex): CalendarMonthData {
  const label = `${monthNameOf(month)} ${year}`;
  const firstWeekday = weekdayIndex(firstOfMonth(year, month));
  const leadingBlanks = (((firstWeekday - weekStartIndex) % 7) + 7) % 7;
  const length = daysInMonth(year, month);

  const buttonData: Record<string, number> = {};
  for (let cell = 1; cell <= GRID_CELLS; cell++) {
    const day = cell - leadingBlanks;
    buttonData[String(cell)] = day >= 1 && day <= length ? day : 0;
  }
  return { month: label, buttonData };
}

/**
 * The two mini calendars and header month name for a week ending on `endDate`: the end date's
 * month on the left, the month after it on the right.
 */
export function calendarsForWeek(endDate: ISODate, weekStartIndex: WeekdayIndex): WeekCalendars {
  const year = yearOf(endDate);
  const month = monthOf(endDate);
  const next = nextMonth(year, month);
  return {
    leftCalendar: monthGrid(year, month, weekStartIndex),
    rightCalendar: monthGrid(next.year, next.month, weekStartIndex),
    currentMonthName: monthName(endDate),
  };
}
