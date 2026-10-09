import { describe, expect, it } from 'vitest';
import { dayNavigation, hourLabel, parseDayId } from './days.ts';

describe('daily page ids', () => {
  it('accepts real ISO dates only', () => {
    expect(parseDayId('2024-02-29')).toBe('2024-02-29');
    for (const id of ['2025-02-29', '2025-13-01', '2025-1-01', '01_2025', '']) {
      expect(() => parseDayId(id)).toThrow('invalid day_id format');
    }
  });

  it('steps across month and year boundaries', () => {
    expect(dayNavigation('2025-12-31')).toEqual({ nextDayId: '2026-01-01', prevDayId: '2025-12-30' });
    expect(dayNavigation('2024-03-01')).toEqual({ nextDayId: '2024-03-02', prevDayId: '2024-02-29' });
  });

  it('labels the 24 hour rows as on the paper page', () => {
    expect(Array.from({ length: 24 }, (_, h) => hourLabel(h))).toEqual([
      '12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM', '7 AM', '8 AM', '9 AM', '10 AM', '11 AM',
      '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM', '6 PM', '7 PM', '8 PM', '9 PM', '10 PM', '11 PM',
    ]);
    expect(() => hourLabel(24)).toThrow('invalid hour: 24');
  });
});
