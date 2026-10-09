/**
 * Planners: one row per planner, owned by a profile. planner_settings is the JSON blob the
 * create-planner form writes and the page builders read (week-start day, holiday scope, colours).
 *
 * Why it is shaped this way:
 *   - `createPlanner` seeds the three bundled default templates right after the insert (unless
 *     told not to), because find-or-build fails with "Default template not found" for a planner
 *     that has none, which is what happened on every fresh install of the Rust build. Seeding is
 *     one statement per template; if it is interrupted, the next `seedDefaultTemplates` call
 *     fills in whichever types are still missing.
 *   - Writes never touch a soft-deleted planner (`AND deleted_at IS NULL`), so a deleted planner
 *     reads as "planner not found" from every function here, the same as a missing one.
 *   - `updatePlanner` is one UPDATE that also bumps updated_at and version, so a row's version
 *     counts every change made through the app. An empty patch writes nothing.
 *   - The week-start setting lives three levels down in planner_settings and is read in one place,
 *     `plannerWeekStartIndex`, so the page builders never reach into the blob themselves. Unknown
 *     or missing values mean Monday, as in the Rust build.
 */

import type { Database, SqlParam } from '../db/Database.ts';
import { nowTimestamp, weekdayIndexFromAbbr, type WeekdayIndex } from './dates.ts';
import { assertId, newId } from './ids.ts';
import { resolveProfileId } from './profiles.ts';
import { seedDefaultTemplates } from './templates.ts';
import type { Planner, PlannerSettings } from './types.ts';

type PlannerRow = {
  id: string;
  profile_id: string;
  name: string;
  description: string | null;
  planner_settings: string;
  created_at: string;
  updated_at: string;
  version: number;
};

const COLUMNS = 'id, profile_id, name, description, planner_settings, created_at, updated_at, version';

export interface CreatePlannerInput {
  name: string;
  description?: string | null;
  /** Defaults to {}. */
  planner_settings?: PlannerSettings;
  /** Defaults to the default profile. */
  profile_id?: string | null;
  /** Supplied by imports that must keep an existing id; otherwise minted here. */
  id?: string;
  /** Default true: insert the bundled default templates so pages can be built at once. */
  seedDefaultTemplates?: boolean;
}

export interface PlannerPatch {
  name?: string;
  description?: string | null;
  planner_settings?: PlannerSettings;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) throw new Error('name must be present');
  return trimmed;
}

function requireSettings(settings: unknown): PlannerSettings {
  if (!isJsonObject(settings)) throw new Error('planner_settings must be a JSON object');
  return settings;
}

function requireDescription(description: unknown): string | null {
  if (description === undefined || description === null) return null;
  if (typeof description !== 'string') throw new Error('description must be a string');
  return description;
}

function toPlanner(row: PlannerRow): Planner {
  return {
    id: row.id,
    profile_id: row.profile_id,
    name: row.name,
    description: row.description,
    planner_settings: JSON.parse(row.planner_settings) as PlannerSettings,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

/** Live planners, oldest first. */
export async function listPlanners(db: Database): Promise<Planner[]> {
  const rows = await db.select<PlannerRow>(
    `SELECT ${COLUMNS} FROM planners WHERE deleted_at IS NULL ORDER BY created_at, id`,
  );
  return rows.map(toPlanner);
}

export async function getPlanner(db: Database, id: string): Promise<Planner | null> {
  const rows = await db.select<PlannerRow>(
    `SELECT ${COLUMNS} FROM planners WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return rows.length > 0 ? toPlanner(rows[0]) : null;
}

/** Like getPlanner, but a malformed id or a missing/deleted planner is an error. */
export async function requirePlanner(db: Database, id: string): Promise<Planner> {
  const planner = await getPlanner(db, assertId(id, 'planner_id'));
  if (planner === null) throw new Error('planner not found');
  return planner;
}

export async function createPlanner(db: Database, input: CreatePlannerInput): Promise<Planner> {
  const name = requireName(input.name);
  const description = requireDescription(input.description);
  const settings = input.planner_settings === undefined ? {} : requireSettings(input.planner_settings);
  const id = input.id === undefined ? newId() : assertId(input.id, 'id');
  const profileId = await resolveProfileId(db, input.profile_id);

  const now = nowTimestamp();
  await db.execute(
    `INSERT INTO planners (id, profile_id, name, description, planner_settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, profileId, name, description, JSON.stringify(settings), now, now],
  );
  if (input.seedDefaultTemplates !== false) await seedDefaultTemplates(db, id, profileId);
  return requirePlanner(db, id);
}

/** Apply the given fields in one UPDATE that also bumps updated_at and version. */
export async function updatePlanner(db: Database, id: string, patch: PlannerPatch): Promise<Planner> {
  assertId(id, 'planner_id');
  const sets: string[] = [];
  const params: SqlParam[] = [];
  if (patch.name !== undefined) {
    sets.push('name = ?');
    params.push(requireName(patch.name));
  }
  if (patch.description !== undefined) {
    sets.push('description = ?');
    params.push(requireDescription(patch.description));
  }
  if (patch.planner_settings !== undefined) {
    sets.push('planner_settings = ?');
    params.push(JSON.stringify(requireSettings(patch.planner_settings)));
  }
  if (sets.length === 0) return requirePlanner(db, id);

  const result = await db.execute(
    `UPDATE planners SET ${sets.join(', ')}, updated_at = ?, version = version + 1
     WHERE id = ? AND deleted_at IS NULL`,
    [...params, nowTimestamp(), id],
  );
  if (result.rowsAffected === 0) throw new Error('planner not found');
  return requirePlanner(db, id);
}

/** Soft delete. Deleting a missing or already deleted planner is a no-op. */
export async function deletePlanner(db: Database, id: string): Promise<void> {
  assertId(id, 'planner_id');
  const now = nowTimestamp();
  await db.execute(
    'UPDATE planners SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL',
    [now, now, id],
  );
}

/** 0 = Monday … 6 = Sunday, from planner_settings.metadata.default_styles["week-start-day"]. */
export function plannerWeekStartIndex(planner: Planner): WeekdayIndex {
  return weekdayIndexFromAbbr(planner.planner_settings.metadata?.default_styles?.['week-start-day']);
}
