/**
 * Monthly page ids ("MM_YYYY").
 *
 * Why: the id puts the month first, the opposite of an ISO date, because every stored monthly
 * page already uses that order. The Rust port only accepted a two-digit month, so the "4_2025"
 * a route could produce was rejected with "invalid month_id format". This port accepts one or
 * two digits and always normalises to two, so a month has exactly one id whichever form the
 * caller used; pages are stored under the normalised id.
 */

import {
  daysInclusive,
  firstOfMonth,
  lastOfMonth,
  nextMonth,
  prevMonth,
  type ISODate,
} from '../dates.ts';

export interface ParsedMonthId {
  /** 1-based. */
  month: number;
  year: number;
  /** Always two-digit month: "04_2025". */
  normalizedMonthId: string;
}

export interface MonthRange {
  start: ISODate;
  end: ISODate;
  /** Every day of the month, ascending. */
  dates: ISODate[];
}

const MONTH_ID_RE = /^(\d{1,2})_(\d{4})$/;

function assertMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error(`invalid month: ${month}`);
}

export function formatMonthId(month: number, year: number): string {
  assertMonth(month);
  return `${month < 10 ? `0${month}` : String(month)}_${year}`;
}

export function parseMonthId(id: string): ParsedMonthId {
  const m = MONTH_ID_RE.exec(id);
  if (!m) throw new Error('invalid month_id format');
  const month = Number(m[1]);
  const year = Number(m[2]);
  if (month < 1 || month > 12) throw new Error('invalid month_id format');
  return { month, year, normalizedMonthId: formatMonthId(month, year) };
}

export function monthRange(year: number, month: number): MonthRange {
  assertMonth(month);
  const start = firstOfMonth(year, month);
  const end = lastOfMonth(year, month);
  return { start, end, dates: daysInclusive(start, end) };
}

export function monthNavigation(month: number, year: number): { nextMonthId: string; prevMonthId: string } {
  assertMonth(month);
  const next = nextMonth(year, month);
  const prev = prevMonth(year, month);
  return {
    nextMonthId: formatMonthId(next.month, next.year),
    prevMonthId: formatMonthId(prev.month, prev.year),
  };
}
