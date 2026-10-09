/**
 * Profiles: the local stand-in for the server's users table. A profile is a name plus a settings
 * blob; accounts (passwords, email, tokens) stay on the server side of the eventual sync.
 *
 * Why it is shaped this way:
 *   - Migration 0001 seeds one well-known profile (DEFAULT_PROFILE_ID) so every install and every
 *     device starts from the same row. `ensureDefaultProfile` re-creates or un-deletes it in ONE
 *     statement (INSERT ... ON CONFLICT DO UPDATE ... WHERE deleted_at IS NOT NULL), because the
 *     storage interface has no transactions. A live row is left untouched, so repeated calls do
 *     not bump its version.
 *   - `resolveProfileId` is the single rule for "which profile owns this new row": an explicit id
 *     must name a live profile, otherwise the default profile is used. It replaces the Rust
 *     "fall back to the first user in the table" convenience, which depended on insertion order.
 *   - Rows are mapped column by column so callers get exactly the Profile type: settings parsed,
 *     deleted_at never exposed. Names are stored trimmed; a blank name is rejected with the Rust
 *     message ("name must be present").
 */

import type { Database } from '../db/Database.ts';
import { nowTimestamp } from './dates.ts';
import { assertId, newId } from './ids.ts';
import { DEFAULT_PROFILE_ID, type Profile } from './types.ts';

type ProfileRow = {
  id: string;
  name: string;
  settings: string;
  created_at: string;
  updated_at: string;
  version: number;
};

const COLUMNS = 'id, name, settings, created_at, updated_at, version';

export interface CreateProfileInput {
  name: string;
  settings?: Record<string, unknown>;
  /** Supplied by imports that must keep an existing id; otherwise minted here. */
  id?: string;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) throw new Error('name must be present');
  return trimmed;
}

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    settings: JSON.parse(row.settings) as Record<string, unknown>,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

async function loadProfile(db: Database, id: string): Promise<Profile> {
  const profile = await getProfile(db, id);
  if (profile === null) throw new Error('profile not found');
  return profile;
}

/** Live profiles, oldest first. */
export async function listProfiles(db: Database): Promise<Profile[]> {
  const rows = await db.select<ProfileRow>(
    `SELECT ${COLUMNS} FROM profiles WHERE deleted_at IS NULL ORDER BY created_at, id`,
  );
  return rows.map(toProfile);
}

export async function getProfile(db: Database, id: string): Promise<Profile | null> {
  const rows = await db.select<ProfileRow>(
    `SELECT ${COLUMNS} FROM profiles WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return rows.length > 0 ? toProfile(rows[0]) : null;
}

export async function createProfile(db: Database, input: CreateProfileInput): Promise<Profile> {
  const name = requireName(input.name);
  if (input.settings !== undefined && !isJsonObject(input.settings)) {
    throw new Error('settings must be a JSON object');
  }
  const id = input.id === undefined ? newId() : assertId(input.id, 'id');
  const now = nowTimestamp();
  await db.execute(
    'INSERT INTO profiles (id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, JSON.stringify(input.settings ?? {}), now, now],
  );
  return loadProfile(db, id);
}

/**
 * The well-known default profile, inserted if a database somehow lacks it and revived if it was
 * soft-deleted. One statement, idempotent: a live row is not modified at all.
 */
export async function ensureDefaultProfile(db: Database): Promise<Profile> {
  const now = nowTimestamp();
  await db.execute(
    `INSERT INTO profiles (id, name, settings, created_at, updated_at)
     VALUES (?, 'Default', '{}', ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       deleted_at = NULL,
       updated_at = excluded.updated_at,
       version = profiles.version + 1
     WHERE profiles.deleted_at IS NOT NULL`,
    [DEFAULT_PROFILE_ID, now, now],
  );
  return loadProfile(db, DEFAULT_PROFILE_ID);
}

/**
 * The profile a new row belongs to. A given id must be a UUID naming a live profile; no id means
 * the default profile.
 */
export async function resolveProfileId(db: Database, profileId?: string | null): Promise<string> {
  if (profileId === undefined || profileId === null) return (await ensureDefaultProfile(db)).id;
  const id = assertId(profileId, 'profile_id');
  const rows = await db.select<{ id: string }>(
    'SELECT id FROM profiles WHERE id = ? AND deleted_at IS NULL',
    [id],
  );
  if (rows.length === 0) throw new Error('profile not found');
  return rows[0].id;
}
