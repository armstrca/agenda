/**
 * Calendar-date helpers. The planner deals in whole days, never in instants, so dates travel
 * through the app as "YYYY-MM-DD" strings (`ISODate`). This module is the only place that
 * converts between those strings and JS `Date` objects.
 *
 * Why: `new Date('2025-10-06')` parses as UTC midnight, which is the previous evening anywhere
 * west of Greenwich, so naive conversions shift a day. Every `Date` created here is local
 * midnight built from components, and every string is formatted from local components.
 *
 * Names are fixed English, matching what the Rust port emitted (`%B`, `%A`), so output does not
 * depend on the machine locale.
 */

export type ISODate = string;

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** Monday-indexed, matching ISO-8601 and the planner's week-start setting. */
export const DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

/** Monday-indexed abbreviations as used in planner_settings `week-start-day`. */
export const WEEKDAY_ABBRS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type WeekdayAbbr = (typeof WEEKDAY_ABBRS)[number];

/** 0 = Monday … 6 = Sunday. */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Build a local-midnight Date from components. Month is 1-based. Safe for years below 100. */
export function makeDate(year: number, month: number, day: number): Date {
  const d = new Date(2000, 0, 1, 0, 0, 0, 0);
  d.setFullYear(year, month - 1, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** True for a well-formed, real calendar date ("2025-02-30" is false). */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const date = makeDate(y, mo, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

export function assertISODate(value: unknown, what = 'date'): ISODate {
  if (!isISODate(value)) throw new Error(`invalid ${what}: expected YYYY-MM-DD, got ${JSON.stringify(value)}`);
  return value;
}

/** "YYYY-MM-DD" → local-midnight Date. Throws on malformed input. */
export function fromISO(iso: ISODate): Date {
  assertISODate(iso);
  return makeDate(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), Number(iso.slice(8, 10)));
}

/** Local components of a Date → "YYYY-MM-DD". */
export function toISO(date: Date): ISODate {
  const y = date.getFullYear();
  const yy = y < 0 ? `-${String(-y).padStart(4, '0')}` : String(y).padStart(4, '0');
  return `${yy}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Components → "YYYY-MM-DD". Month is 1-based. Normalises overflow (month 13 → next January). */
export function isoFromParts(year: number, month: number, day: number): ISODate {
  return toISO(makeDate(year, month, day));
}

export function yearOf(iso: ISODate): number {
  return Number(assertISODate(iso).slice(0, 4));
}

/** 1-based month. */
export function monthOf(iso: ISODate): number {
  return Number(assertISODate(iso).slice(5, 7));
}

export function dayOf(iso: ISODate): number {
  return Number(assertISODate(iso).slice(8, 10));
}

/** Add (or with a negative n, subtract) whole days. DST-safe because it works on local components. */
export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

/** Every date from start to end inclusive, ascending. Empty if end < start. */
export function daysInclusive(start: ISODate, end: ISODate): ISODate[] {
  assertISODate(start, 'start');
  assertISODate(end, 'end');
  const out: ISODate[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Lexical order is chronological for zero-padded ISO dates. */
export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Days from a to b (b - a). Negative when b is earlier. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = Date.UTC(yearOf(b), monthOf(b) - 1, dayOf(b)) - Date.UTC(yearOf(a), monthOf(a) - 1, dayOf(a));
  return Math.round(ms / 86_400_000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso: ISODate): WeekdayIndex {
  return ((fromISO(iso).getDay() + 6) % 7) as WeekdayIndex;
}

/**
 * Parse a planner `week-start-day` value ("Mon", "Sun", …). Unknown or missing values fall back
 * to Monday, exactly as the Rust port did.
 */
export function weekdayIndexFromAbbr(abbr: unknown): WeekdayIndex {
  const i = typeof abbr === 'string' ? (WEEKDAY_ABBRS as readonly string[]).indexOf(abbr) : -1;
  return (i === -1 ? 0 : i) as WeekdayIndex;
}

export function weekdayAbbr(index: number): WeekdayAbbr {
  return WEEKDAY_ABBRS[((index % 7) + 7) % 7];
}

/** "October" */
export function monthName(iso: ISODate): string {
  return MONTH_NAMES[monthOf(iso) - 1];
}

/** "October" for a 1-based month number. */
export function monthNameOf(month: number): string {
  const name = MONTH_NAMES[month - 1];
  if (!name) throw new Error(`invalid month: ${month}`);
  return name;
}

/** "Monday" */
export function dayName(iso: ISODate): string {
  return DAY_NAMES[weekdayIndex(iso)];
}

/** "October 2025" */
export function monthYear(iso: ISODate): string {
  return `${monthName(iso)} ${yearOf(iso)}`;
}

export function daysInMonth(year: number, month: number): number {
  // Day 0 of the next month is the last day of this month.
  return makeDate(year, month + 1, 0).getDate();
}

export function firstOfMonth(year: number, month: number): ISODate {
  return isoFromParts(year, month, 1);
}

export function lastOfMonth(year: number, month: number): ISODate {
  return isoFromParts(year, month, daysInMonth(year, month));
}

export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function prevMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** Today's local calendar date. */
export function todayISO(): ISODate {
  return toISO(new Date());
}

/** Current instant as an ISO-8601 UTC timestamp, for created_at / updated_at columns. */
export function nowTimestamp(): string {
  return new Date().toISOString();
}
