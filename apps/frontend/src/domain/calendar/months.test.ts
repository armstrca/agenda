import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { firstOfMonthLabel, formatMonthId, monthNavigation, monthRange, parseMonthId } from './months.ts';

const FIXTURES_DIR = fileURLToPath(new URL('../__fixtures__/', import.meta.url));

interface MonthlyFixture {
  request: { command: string; payload: { planner_id: string; month_id?: string } };
  response: { success: boolean; error?: string };
}

function loadMonthlyFixtures(): Array<{ name: string; fixture: MonthlyFixture }> {
  const out: Array<{ name: string; fixture: MonthlyFixture }> = [];
  for (const entry of readdirSync(FIXTURES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of readdirSync(join(FIXTURES_DIR, entry.name))) {
      if (!file.startsWith('monthly_') || !file.endsWith('.json')) continue;
      const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, entry.name, file), 'utf8')) as MonthlyFixture;
      out.push({ name: `${entry.name}/${file}`, fixture });
    }
  }
  return out;
}

const monthlyFixtures = loadMonthlyFixtures();
const accepted = monthlyFixtures.filter(({ fixture }) => fixture.response.success);
const rejected = monthlyFixtures.filter(({ fixture }) => !fixture.response.success);

describe('parseMonthId against the Rust golden fixtures', () => {
  it('finds monthly fixtures', () => {
    expect(accepted.length).toBeGreaterThan(0);
    expect(rejected.length).toBeGreaterThan(0);
  });

  it.each(accepted)('$name: an id the Rust side accepted is already normalised', ({ fixture }) => {
    const id = fixture.request.payload.month_id!;
    expect(parseMonthId(id).normalizedMonthId).toBe(id);
  });

  it.each(rejected)('$name: the one-digit month Rust rejected is accepted here (deliberate divergence)', ({ fixture }) => {
    // The Rust regex was ^(\d{2})_(\d{4})$; the plan accepts M_YYYY and normalises it.
    expect(fixture.response.error).toContain('invalid month_id format');
    const id = fixture.request.payload.month_id!;
    const parsed = parseMonthId(id);
    expect(parsed.normalizedMonthId).not.toBe(id);
    expect(parsed.normalizedMonthId).toBe(formatMonthId(parsed.month, parsed.year));
  });
});

describe('parseMonthId', () => {
  it('accepts one- and two-digit months and normalises to two digits', () => {
    expect(parseMonthId('4_2025')).toEqual({ month: 4, year: 2025, normalizedMonthId: '04_2025' });
    expect(parseMonthId('04_2025')).toEqual({ month: 4, year: 2025, normalizedMonthId: '04_2025' });
    expect(parseMonthId('12_2025')).toEqual({ month: 12, year: 2025, normalizedMonthId: '12_2025' });
    expect(parseMonthId('1_2026')).toEqual({ month: 1, year: 2026, normalizedMonthId: '01_2026' });
  });

  it.each(['13_2025', '00_2025', '0_2025', '2025_04', '', '004_2025', '04_25', '04_2025_l', '04-2025'])(
    'rejects %j',
    (id) => {
      expect(() => parseMonthId(id)).toThrow('invalid month_id format');
    },
  );
});

describe('formatMonthId', () => {
  it('zero-pads the month', () => {
    expect(formatMonthId(4, 2025)).toBe('04_2025');
    expect(formatMonthId(10, 2025)).toBe('10_2025');
  });

  it('refuses an impossible month', () => {
    expect(() => formatMonthId(13, 2025)).toThrow('invalid month');
    expect(() => formatMonthId(0, 2025)).toThrow('invalid month');
  });
});

describe('monthRange', () => {
  it('covers a leap February', () => {
    const range = monthRange(2024, 2);
    expect(range.start).toBe('2024-02-01');
    expect(range.end).toBe('2024-02-29');
    expect(range.dates).toHaveLength(29);
    expect(range.dates[0]).toBe('2024-02-01');
    expect(range.dates[28]).toBe('2024-02-29');
  });

  it('covers a common February and a 31-day December', () => {
    expect(monthRange(2025, 2).dates).toHaveLength(28);
    expect(monthRange(2025, 2).end).toBe('2025-02-28');
    const december = monthRange(2025, 12);
    expect(december.dates).toHaveLength(31);
    expect(december.end).toBe('2025-12-31');
  });

  it('refuses an impossible month', () => {
    expect(() => monthRange(2025, 13)).toThrow('invalid month');
  });
});

describe('monthNavigation', () => {
  it('wraps December forward into the next year', () => {
    expect(monthNavigation(12, 2025)).toEqual({ nextMonthId: '01_2026', prevMonthId: '11_2025' });
  });

  it('wraps January back into the previous year', () => {
    expect(monthNavigation(1, 2025)).toEqual({ nextMonthId: '02_2025', prevMonthId: '12_2024' });
  });

  it('stays within the year otherwise', () => {
    expect(monthNavigation(4, 2025)).toEqual({ nextMonthId: '05_2025', prevMonthId: '03_2025' });
  });
});

describe('firstOfMonthLabel', () => {
  it('reads the "Month YYYY" labels the calendars produce', () => {
    expect(firstOfMonthLabel('October 2025')).toBe('2025-10-01');
    expect(firstOfMonthLabel('January 2026')).toBe('2026-01-01');
  });

  it('returns null for anything else', () => {
    for (const label of ['', 'Octember 2025', 'october 2025', 'October', '10_2025', 'October 25']) {
      expect(firstOfMonthLabel(label)).toBeNull();
    }
  });
});
