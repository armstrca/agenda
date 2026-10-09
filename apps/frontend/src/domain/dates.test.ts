import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayName,
  daysBetween,
  daysInMonth,
  daysInclusive,
  fromISO,
  isISODate,
  isoFromParts,
  lastOfMonth,
  monthYear,
  toISO,
  weekdayIndex,
  weekdayIndexFromAbbr,
} from './dates.ts';

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isISODate('2025-10-06')).toBe(true);
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2025-02-29')).toBe(false);
    expect(isISODate('2025-13-01')).toBe(false);
    expect(isISODate('2025-1-1')).toBe(false);
    expect(isISODate('2025-10-06T00:00:00Z')).toBe(false);
    expect(isISODate(20251006)).toBe(false);
  });

  it('round-trips through local-midnight Dates without shifting a day', () => {
    for (const iso of ['2025-10-06', '2024-02-29', '2025-01-01', '2025-12-31', '0099-03-15']) {
      const d = fromISO(iso);
      expect(d.getHours()).toBe(0);
      expect(toISO(d)).toBe(iso);
    }
  });

  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2025-10-31', 1)).toBe('2025-11-01');
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2025-01-01', -1)).toBe('2024-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    // US DST starts 2025-03-09 and ends 2025-11-02.
    expect(addDays('2025-03-08', 2)).toBe('2025-03-10');
    expect(addDays('2025-11-01', 2)).toBe('2025-11-03');
    expect(addDays('2025-03-09', -7)).toBe('2025-03-02');
  });

  it('lists inclusive ranges', () => {
    expect(daysInclusive('2025-12-30', '2026-01-02')).toEqual([
      '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
    ]);
    expect(daysInclusive('2025-01-02', '2025-01-01')).toEqual([]);
  });

  it('counts days between', () => {
    expect(daysBetween('2025-10-06', '2025-10-12')).toBe(6);
    expect(daysBetween('2025-10-12', '2025-10-06')).toBe(-6);
    expect(daysBetween('2024-12-30', '2025-01-05')).toBe(6);
  });

  it('indexes weekdays from Monday', () => {
    expect(weekdayIndex('2025-10-06')).toBe(0); // Monday
    expect(weekdayIndex('2025-10-12')).toBe(6); // Sunday
    expect(dayName('2025-10-09')).toBe('Thursday');
  });

  it('parses week-start abbreviations with Monday fallback', () => {
    expect(weekdayIndexFromAbbr('Sun')).toBe(6);
    expect(weekdayIndexFromAbbr('Mon')).toBe(0);
    expect(weekdayIndexFromAbbr('Sat')).toBe(5);
    expect(weekdayIndexFromAbbr('monday')).toBe(0);
    expect(weekdayIndexFromAbbr(undefined)).toBe(0);
  });

  it('formats names in fixed English', () => {
    expect(monthYear('2025-10-06')).toBe('October 2025');
    expect(monthYear('2024-12-30')).toBe('December 2024');
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2025, 12)).toBe(31);
    expect(lastOfMonth(2025, 11)).toBe('2025-11-30');
    expect(isoFromParts(2025, 13, 1)).toBe('2026-01-01');
  });
});
