/**
 * Daily page ids ("YYYY-MM-DD").
 *
 * Why: a day already has one canonical spelling, the ISO date every entry is stored under, so the
 * page id is that date rather than a new format to normalise. Anything that is not a real
 * calendar date ("2025-02-30") is rejected with "invalid day_id format", in the same style as the
 * weekly and monthly ids.
 */

import { addDays, isISODate, type ISODate } from '../dates.ts';

export function parseDayId(id: string): ISODate {
  if (!isISODate(id)) throw new Error('invalid day_id format');
  return id;
}

/** The label of an hour row on the daily page: 0 → "12 AM", 13 → "1 PM". */
export function hourLabel(hour: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error(`invalid hour: ${hour}`);
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'AM' : 'PM'}`;
}

export function dayNavigation(date: ISODate): { nextDayId: string; prevDayId: string } {
  return { nextDayId: addDays(date, 1), prevDayId: addDays(date, -1) };
}
