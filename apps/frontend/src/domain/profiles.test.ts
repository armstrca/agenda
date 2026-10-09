import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SqlJsDatabase } from '../db/adapters/sqljs.ts';
import { createTestDb } from '../db/testing.ts';
import { isId, newId } from './ids.ts';
import { createProfile, ensureDefaultProfile, getProfile, listProfiles, resolveProfileId } from './profiles.ts';
import { DEFAULT_PROFILE_ID } from './types.ts';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe('profiles', () => {
  let db: SqlJsDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it('starts with the default profile from the migration', async () => {
    const profiles = await listProfiles(db);
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toStrictEqual({
      id: DEFAULT_PROFILE_ID,
      name: 'Default',
      settings: {},
      created_at: expect.stringMatching(TIMESTAMP),
      updated_at: expect.stringMatching(TIMESTAMP),
      version: 1,
    });
    expect(await getProfile(db, DEFAULT_PROFILE_ID)).toStrictEqual(profiles[0]);
    expect(await getProfile(db, newId())).toBeNull();
    expect(await getProfile(db, 'nope')).toBeNull();
  });

  it('creates a profile with a trimmed name and settings stored as JSON', async () => {
    const settings = { theme: 'dark', nested: { a: [1, 2] } };
    const profile = await createProfile(db, { name: '  Calvin  ', settings });
    expect(profile).toStrictEqual({
      id: expect.any(String),
      name: 'Calvin',
      settings,
      created_at: expect.stringMatching(TIMESTAMP),
      updated_at: profile.created_at,
      version: 1,
    });
    expect(isId(profile.id)).toBe(true);
    // The settings come back parsed from the row, not as the caller's object.
    expect(profile.settings).not.toBe(settings);

    const raw = await db.select('SELECT settings, deleted_at FROM profiles WHERE id = ?', [profile.id]);
    expect(raw).toEqual([{ settings: JSON.stringify(settings), deleted_at: null }]);
    expect(await getProfile(db, profile.id)).toStrictEqual(profile);
    expect((await listProfiles(db)).map(p => p.name)).toEqual(['Default', 'Calvin']);
  });

  it('defaults settings to {} and accepts a supplied id', async () => {
    const id = newId();
    const profile = await createProfile(db, { name: 'Imported', id });
    expect(profile.id).toBe(id);
    expect(profile.settings).toEqual({});
    await expect(createProfile(db, { name: 'x', id: 'nope' })).rejects.toThrow('invalid id (expected UUID)');
  });

  it('rejects a blank name and non-object settings', async () => {
    await expect(createProfile(db, { name: '   ' })).rejects.toThrow('name must be present');
    await expect(createProfile(db, { name: '' })).rejects.toThrow('name must be present');
    await expect(createProfile(db, { name: undefined as unknown as string })).rejects.toThrow('name must be present');
    await expect(
      createProfile(db, { name: 'x', settings: [] as unknown as Record<string, unknown> }),
    ).rejects.toThrow('settings must be a JSON object');
    await expect(
      createProfile(db, { name: 'x', settings: 'dark' as unknown as Record<string, unknown> }),
    ).rejects.toThrow('settings must be a JSON object');
    await expect(
      createProfile(db, { name: 'x', settings: null as unknown as Record<string, unknown> }),
    ).rejects.toThrow('settings must be a JSON object');
    expect(await listProfiles(db)).toHaveLength(1);
  });

  it('hides soft-deleted profiles from list and get', async () => {
    const profile = await createProfile(db, { name: 'Gone' });
    await db.execute('UPDATE profiles SET deleted_at = ? WHERE id = ?', ['2026-01-01T00:00:00.000Z', profile.id]);
    expect(await getProfile(db, profile.id)).toBeNull();
    expect((await listProfiles(db)).map(p => p.id)).toEqual([DEFAULT_PROFILE_ID]);
  });

  describe('ensureDefaultProfile', () => {
    it('is idempotent on a live row', async () => {
      const before = await getProfile(db, DEFAULT_PROFILE_ID);
      expect(await ensureDefaultProfile(db)).toStrictEqual(before);
      expect(await ensureDefaultProfile(db)).toStrictEqual(before);
      expect(await db.select('SELECT count(*) AS n FROM profiles')).toEqual([{ n: 1 }]);
      expect(await db.select('SELECT version FROM profiles WHERE id = ?', [DEFAULT_PROFILE_ID])).toEqual([
        { version: 1 },
      ]);
    });

    it('re-inserts the default profile when the row is missing', async () => {
      await db.execute('DELETE FROM profiles WHERE id = ?', [DEFAULT_PROFILE_ID]);
      expect(await listProfiles(db)).toEqual([]);

      const profile = await ensureDefaultProfile(db);
      expect(profile).toStrictEqual({
        id: DEFAULT_PROFILE_ID,
        name: 'Default',
        settings: {},
        created_at: expect.stringMatching(TIMESTAMP),
        updated_at: profile.created_at,
        version: 1,
      });
      expect(await listProfiles(db)).toStrictEqual([profile]);
    });

    it('revives a soft-deleted default profile, bumping its version once', async () => {
      await db.execute('UPDATE profiles SET deleted_at = ? WHERE id = ?', [
        '2026-01-01T00:00:00.000Z',
        DEFAULT_PROFILE_ID,
      ]);
      expect(await getProfile(db, DEFAULT_PROFILE_ID)).toBeNull();
      expect(await listProfiles(db)).toEqual([]);

      const revived = await ensureDefaultProfile(db);
      expect(revived.id).toBe(DEFAULT_PROFILE_ID);
      expect(revived.name).toBe('Default');
      expect(revived.version).toBe(2);
      expect(await db.select('SELECT deleted_at FROM profiles WHERE id = ?', [DEFAULT_PROFILE_ID])).toEqual([
        { deleted_at: null },
      ]);
      expect(await listProfiles(db)).toStrictEqual([revived]);

      // Now that it is live again, further calls leave it alone.
      expect(await ensureDefaultProfile(db)).toStrictEqual(revived);
    });
  });

  describe('resolveProfileId', () => {
    it('falls back to the default profile when no id is given', async () => {
      expect(await resolveProfileId(db)).toBe(DEFAULT_PROFILE_ID);
      expect(await resolveProfileId(db, null)).toBe(DEFAULT_PROFILE_ID);
      expect(await resolveProfileId(db, undefined)).toBe(DEFAULT_PROFILE_ID);
    });

    it('recreates the default profile on the way if it was lost', async () => {
      await db.execute('DELETE FROM profiles WHERE id = ?', [DEFAULT_PROFILE_ID]);
      expect(await resolveProfileId(db)).toBe(DEFAULT_PROFILE_ID);
      expect(await getProfile(db, DEFAULT_PROFILE_ID)).not.toBeNull();
    });

    it('returns a live profile id as given', async () => {
      const profile = await createProfile(db, { name: 'Calvin' });
      expect(await resolveProfileId(db, profile.id)).toBe(profile.id);
      expect(await resolveProfileId(db, DEFAULT_PROFILE_ID)).toBe(DEFAULT_PROFILE_ID);
    });

    it('rejects unknown and soft-deleted profiles', async () => {
      await expect(resolveProfileId(db, newId())).rejects.toThrow('profile not found');

      const profile = await createProfile(db, { name: 'Gone' });
      await db.execute('UPDATE profiles SET deleted_at = ? WHERE id = ?', ['2026-01-01T00:00:00.000Z', profile.id]);
      await expect(resolveProfileId(db, profile.id)).rejects.toThrow('profile not found');
    });

    it('rejects malformed ids before touching the database', async () => {
      await expect(resolveProfileId(db, 'nope')).rejects.toThrow('invalid profile_id (expected UUID)');
      await expect(resolveProfileId(db, '')).rejects.toThrow('invalid profile_id (expected UUID)');
      await expect(resolveProfileId(db, '00000000000040008000000000000001')).rejects.toThrow(
        'invalid profile_id (expected UUID)',
      );
    });
  });
});
