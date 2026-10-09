import { describe, expect, it } from 'vitest';
import { assertId, isId, newId } from './ids.ts';

describe('ids', () => {
  it('mints unique v4 UUIDs', () => {
    const a = newId();
    const b = newId();
    expect(isId(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(a.charAt(14)).toBe('4');
  });

  it('accepts the well-known default profile id and rejects junk', () => {
    expect(isId('00000000-0000-4000-8000-000000000001')).toBe(true);
    expect(isId('38e012ec-0ab2-4fbe-8e68-8a75e4716a35')).toBe(true);
    expect(isId('38e012ec0ab24fbe8e688a75e4716a35')).toBe(false);
    expect(isId('')).toBe(false);
    expect(isId(42)).toBe(false);
    expect(() => assertId('nope', 'planner_id')).toThrow('invalid planner_id (expected UUID)');
  });
});
