/**
 * ISO week arithmetic behind weekly page ids ("W_YYYY_l" / "W_YYYY_r").
 *
 * Why the rules are what they are:
 *   - Week numbers and week-years are ISO-8601 (week 1 holds 4 January; a year has 52 or 53
 *     weeks, the count being the ISO week of 28 December). The planner's week-start day does
 *     not change the numbering, only where the seven-day window sits: the window is found by
 *     stepping BACKWARDS from the ISO Monday, so a Sunday-start week 1 of 2025 begins on
 *     Sunday 2024-12-29, never on the Sunday after. Rails and the Rust port both did this and
 *     every stored week page depends on it.
 *   - Looking a date up therefore depends on the start day too: the Sunday that ISO puts at the
 *     END of week W is the first day of week W+1 for a Sunday-start planner. `weekIdForDate`
 *     takes the start index and shifts the date forward by exactly the distance `weekRange`
 *     steps back, so the page it names always contains the date. (The old planners route used a
 *     non-ISO formula for "this week"; this function is its replacement.)
 *   - Out-of-range weeks normalise in a single step (0 -> last week of the previous year,
 *     54 -> week 1 of the next year) rather than by repeated carrying, because that is what the
 *     Rust code did and what the golden fixtures encode. "0_2025" and "53_2025" are both reachable
 *     from the navigation links of neighbouring pages.
 *   - Ids are never zero-padded ("1_2026_l"); pages are stored under the normalised id.
 *   - Every date goes through dates.ts, so no Date is ever built from a string.
 */

import {
  addDays,
  daysBetween,
  daysInclusive,
  isoFromParts,
  weekdayIndex,
  yearOf,
  type ISODate,
  type WeekdayIndex,
} from '../dates.ts';

export type WeekSide = 'l' | 'r';

export interface ParsedWeekId {
  week: number;
  year: number;
  side: WeekSide;
}

export interface WeekRange {
  start: ISODate;
  end: ISODate;
  /** The seven days from start to end, ascending. */
  dates: ISODate[];
}

export interface ResolvedWeek {
  weekNumber: number;
  year: number;
  side: WeekSide;
  /** The id the page is stored under: normalised week and year, original side. */
  normalizedWeekId: string;
  weekStart: ISODate;
  endDate: ISODate;
  mainDates: ISODate[];
  weeksInYear: number;
  nextWeekId: string;
  prevWeekId: string;
  weekStartIndex: WeekdayIndex;
}

const WEEK_ID_RE = /^(\d{1,2})_(\d{4})_([lr])$/;

export function parseWeekId(id: string): ParsedWeekId {
  const m = WEEK_ID_RE.exec(id);
  if (!m) throw new Error('invalid week_id format');
  return { week: Number(m[1]), year: Number(m[2]), side: m[3] as WeekSide };
}

export function formatWeekId(week: number, year: number, side: WeekSide): string {
  return `${week}_${year}_${side}`;
}

/** Monday of ISO week 1: 4 January is always in week 1, so step back to its Monday. */
function isoWeek1Monday(year: number): ISODate {
  const jan4 = isoFromParts(year, 1, 4);
  return addDays(jan4, -weekdayIndex(jan4));
}

/** The Monday that starts ISO week `week` of ISO week-year `year`. */
export function isoWeekMonday(year: number, week: number): ISODate {
  return addDays(isoWeek1Monday(year), (week - 1) * 7);
}

/** ISO week-year and week of a date. The Thursday of the date's Monday-based week fixes the year. */
function isoWeekOf(iso: ISODate): { week: number; year: number } {
  const monday = addDays(iso, -weekdayIndex(iso));
  const year = yearOf(addDays(monday, 3));
  return { week: daysBetween(isoWeek1Monday(year), monday) / 7 + 1, year };
}

/** 52 or 53: the ISO week number of 28 December, which always falls in the year's last week. */
export function weeksInYear(year: number): number {
  return isoWeekOf(isoFromParts(year, 12, 28)).week;
}

/**
 * Roll an out-of-range week into a neighbouring year in one step. `weeksInYear` in the result
 * is for the resulting year.
 */
export function normalizeWeek(week: number, year: number): { week: number; year: number; weeksInYear: number } {
  const weeksThisYear = weeksInYear(year);
  if (week < 1) {
    const prevYearWeeks = weeksInYear(year - 1);
    return { week: prevYearWeeks, year: year - 1, weeksInYear: prevYearWeeks };
  }
  if (week > weeksThisYear) {
    return { week: 1, year: year + 1, weeksInYear: weeksInYear(year + 1) };
  }
  return { week, year, weeksInYear: weeksThisYear };
}

/** Days from the ISO Monday (0) back to the previous occurrence of the start weekday. */
function stepBackFromMonday(weekStartIndex: WeekdayIndex): number {
  return (7 - weekStartIndex) % 7;
}

/**
 * The seven days shown for an ISO week when the planner's week starts on `weekStartIndex`.
 * Starts at the ISO Monday and walks backwards to the nearest start day at or before it.
 */
export function weekRange(year: number, week: number, weekStartIndex: WeekdayIndex): WeekRange {
  const start = addDays(isoWeekMonday(year, week), -stepBackFromMonday(weekStartIndex));
  const end = addDays(start, 6);
  return { start, end, dates: daysInclusive(start, end) };
}

/**
 * Page-to-page links. A week is two pages, left then right, so "next" from a left page is the
 * same week's right page and "prev" from a right page is the same week's left page.
 */
export function weekNavigation(
  week: number,
  year: number,
  side: WeekSide,
  weeksThisYear: number,
): { nextWeekId: string; prevWeekId: string } {
  const nextWeekId =
    side === 'l'
      ? formatWeekId(week, year, 'r')
      : week < weeksThisYear
        ? formatWeekId(week + 1, year, 'l')
        : formatWeekId(1, year + 1, 'l');
  const prevWeekId =
    side === 'r'
      ? formatWeekId(week, year, 'l')
      : week > 1
        ? formatWeekId(week - 1, year, 'r')
        : formatWeekId(weeksInYear(year - 1), year - 1, 'r');
  return { nextWeekId, prevWeekId };
}

/**
 * The id of the page that shows a date, e.g. 2024-12-30 -> "1_2025_l".
 *
 * `weekStartIndex` must be the week-start day of the planner, because it moves the window:
 * `weekRange` puts page W at [Monday - k, Monday - k + 6] with k = (7 - weekStartIndex) % 7, so a
 * date d is on the page whose ISO week contains d + k. For a Monday start k is 0 and this is the
 * plain ISO week; for a Sunday start, Sunday 2025-01-05 is in ISO week 1 but on page "2_2025".
 */
export function weekIdForDate(iso: ISODate, side: WeekSide = 'l', weekStartIndex: WeekdayIndex = 0): string {
  const { week, year } = isoWeekOf(addDays(iso, stepBackFromMonday(weekStartIndex)));
  return formatWeekId(week, year, side);
}

/** parse -> normalise -> range -> navigation, everything the weekly page builder needs. */
export function resolveWeek(weekId: string, weekStartIndex: WeekdayIndex): ResolvedWeek {
  const parsed = parseWeekId(weekId);
  const { week, year, weeksInYear: weeksThisYear } = normalizeWeek(parsed.week, parsed.year);
  const { start, end, dates } = weekRange(year, week, weekStartIndex);
  const { nextWeekId, prevWeekId } = weekNavigation(week, year, parsed.side, weeksThisYear);
  return {
    weekNumber: week,
    year,
    side: parsed.side,
    normalizedWeekId: formatWeekId(week, year, parsed.side),
    weekStart: start,
    endDate: end,
    mainDates: dates,
    weeksInYear: weeksThisYear,
    nextWeekId,
    prevWeekId,
    weekStartIndex,
  };
}
