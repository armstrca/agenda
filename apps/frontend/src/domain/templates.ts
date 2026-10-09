/**
 * Page templates: the JSON layouts pages are rendered from. Each planner owns its templates and
 * marks one per type as the default that find-or-build uses for a period it has not seen yet.
 *
 * Why it is shaped this way:
 *   - `saveTemplate` is an upsert by id in one INSERT ... ON CONFLICT(id) DO UPDATE, so the
 *     template editor saves repeatedly without a create/update split, and a soft-deleted template
 *     saved again comes back (deleted_at = NULL) with its id. planner_id and profile_id are fixed
 *     at creation: a template never moves between planners, and an id that already belongs to
 *     another planner's template is refused rather than silently rewriting that template.
 *   - "One default per type" cannot be a database constraint without transactions, so saving a
 *     default takes two statements: the upsert, then an UPDATE demoting the planner's other live
 *     defaults of that type. Between the two there may briefly be two defaults;
 *     `findDefaultTemplate` tolerates that by preferring the most recently updated row, which is
 *     the one just saved.
 *   - The bundled defaults under src/templates/defaults are what every new planner gets. Seeding
 *     is per type and skips types that already have a live default, so it is safe to run again
 *     after a partial failure or after a default was deleted. It can be limited to some types, so
 *     a page type added later (daily) can be seeded into older planners on first use without
 *     reviving defaults of other types the user deleted on purpose.
 *   - Validation keeps the Rust error strings ("invalid template_type: x", "invalid template
 *     structure: content must be a JSON object") because the template editor shows them, and adds
 *     the shape check the renderers rely on (metadata object, structure array). The allow-list is
 *     TEMPLATE_TYPES from types.ts, which includes the editor's `extra` type the Rust model
 *     rejected.
 *   - `toTemplateRecord` keeps `user_id` as the key for the profile id because the renderers and
 *     processTemplateAssets read that name.
 */

import type { Database } from '../db/Database.ts';
import dailyDefault from '../templates/defaults/daily.json';
import monthlyDefault from '../templates/defaults/monthly.json';
import weeklyLeftDefault from '../templates/defaults/weekly_left.json';
import weeklyRightDefault from '../templates/defaults/weekly_right.json';
import { nowTimestamp } from './dates.ts';
import { assertId, newId } from './ids.ts';
import { resolveProfileId } from './profiles.ts';
import {
  TEMPLATE_TYPES,
  type PageTemplate,
  type TemplateContent,
  type TemplateRecord,
  type TemplateType,
} from './types.ts';

type TemplateRow = {
  id: string;
  planner_id: string;
  profile_id: string;
  name: string;
  template_type: string;
  is_default: number;
  content: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
  version: number;
};

const COLUMNS =
  'id, planner_id, profile_id, name, template_type, is_default, content, schema_version, created_at, updated_at, version';

export interface BundledTemplate {
  name: string;
  template_type: string;
  content: unknown;
}

/** The templates every new planner starts with, in seeding order. */
export const BUNDLED_DEFAULT_TEMPLATES: ReadonlyArray<BundledTemplate> = [
  weeklyLeftDefault,
  weeklyRightDefault,
  monthlyDefault,
  dailyDefault,
];

export interface SaveTemplateInput {
  /** Omit to create; pass an existing id to update it in place. */
  id?: string;
  planner_id: string;
  /** Defaults to the planner's profile. */
  profile_id?: string | null;
  name: string;
  template_type: string;
  is_default: boolean;
  content: unknown;
  /** Defaults to 1. */
  schema_version?: number;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireName(name: unknown): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (trimmed.length === 0) throw new Error('name must be present');
  return trimmed;
}

export function isTemplateType(value: unknown): value is TemplateType {
  return typeof value === 'string' && (TEMPLATE_TYPES as readonly string[]).includes(value);
}

export function validateTemplateContent(content: unknown): asserts content is TemplateContent {
  if (!isJsonObject(content)) {
    throw new Error('invalid template structure: content must be a JSON object');
  }
  if (!isJsonObject(content.metadata) || !Array.isArray(content.structure)) {
    throw new Error(
      'invalid template structure: content.metadata must be an object and content.structure an array',
    );
  }
}

function toTemplate(row: TemplateRow): PageTemplate {
  return {
    id: row.id,
    planner_id: row.planner_id,
    profile_id: row.profile_id,
    name: row.name,
    template_type: row.template_type as TemplateType,
    is_default: row.is_default === 1,
    content: JSON.parse(row.content) as TemplateContent,
    schema_version: row.schema_version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

/** The live planner's profile id, or "planner not found". Kept local to avoid a planners cycle. */
async function plannerProfileId(db: Database, plannerId: string): Promise<string> {
  const rows = await db.select<{ profile_id: string }>(
    'SELECT profile_id FROM planners WHERE id = ? AND deleted_at IS NULL',
    [plannerId],
  );
  if (rows.length === 0) throw new Error('planner not found');
  return rows[0].profile_id;
}

/** A planner's live templates, oldest first. */
export async function listTemplates(db: Database, plannerId: string): Promise<PageTemplate[]> {
  const rows = await db.select<TemplateRow>(
    `SELECT ${COLUMNS} FROM page_templates WHERE planner_id = ? AND deleted_at IS NULL ORDER BY created_at, id`,
    [plannerId],
  );
  return rows.map(toTemplate);
}

export async function getTemplate(db: Database, id: string): Promise<PageTemplate | null> {
  const rows = await db.select<TemplateRow>(
    `SELECT ${COLUMNS} FROM page_templates WHERE id = ? AND deleted_at IS NULL`,
    [id],
  );
  return rows.length > 0 ? toTemplate(rows[0]) : null;
}

/** The planner's live default of that type; with several, the most recently updated one. */
export async function findDefaultTemplate(
  db: Database,
  plannerId: string,
  templateType: TemplateType,
): Promise<PageTemplate | null> {
  const rows = await db.select<TemplateRow>(
    `SELECT ${COLUMNS} FROM page_templates
     WHERE planner_id = ? AND template_type = ? AND is_default = 1 AND deleted_at IS NULL
     ORDER BY updated_at DESC, created_at DESC, id
     LIMIT 1`,
    [plannerId, templateType],
  );
  return rows.length > 0 ? toTemplate(rows[0]) : null;
}

export async function saveTemplate(db: Database, input: SaveTemplateInput): Promise<PageTemplate> {
  const plannerId = assertId(input.planner_id, 'planner_id');
  if (!isTemplateType(input.template_type)) {
    throw new Error(`invalid template_type: ${String(input.template_type)}`);
  }
  const name = requireName(input.name);
  validateTemplateContent(input.content);
  const schemaVersion = input.schema_version ?? 1;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
    throw new Error('schema_version must be a positive integer');
  }
  const id = input.id === undefined ? newId() : assertId(input.id, 'id');

  const ownerProfileId = await plannerProfileId(db, plannerId);
  const profileId =
    input.profile_id === undefined || input.profile_id === null
      ? ownerProfileId
      : await resolveProfileId(db, input.profile_id);

  const now = nowTimestamp();
  const isDefault = input.is_default ? 1 : 0;
  // The DO UPDATE is guarded by planner_id so a foreign template is left untouched; the check
  // after the select turns that no-op into an error.
  await db.execute(
    `INSERT INTO page_templates
       (id, planner_id, profile_id, name, template_type, is_default, content, schema_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       template_type = excluded.template_type,
       is_default = excluded.is_default,
       content = excluded.content,
       schema_version = excluded.schema_version,
       updated_at = excluded.updated_at,
       version = page_templates.version + 1,
       deleted_at = NULL
     WHERE page_templates.planner_id = excluded.planner_id`,
    [
      id,
      plannerId,
      profileId,
      name,
      input.template_type,
      isDefault,
      JSON.stringify(input.content),
      schemaVersion,
      now,
      now,
    ],
  );

  const rows = await db.select<TemplateRow>(`SELECT ${COLUMNS} FROM page_templates WHERE id = ?`, [id]);
  if (rows.length === 0) throw new Error('template not found');
  if (rows[0].planner_id !== plannerId) throw new Error('template belongs to another planner');

  if (isDefault === 1) {
    await db.execute(
      `UPDATE page_templates
       SET is_default = 0, updated_at = ?, version = version + 1
       WHERE planner_id = ? AND template_type = ? AND id <> ? AND is_default = 1 AND deleted_at IS NULL`,
      [now, plannerId, input.template_type, id],
    );
  }
  return toTemplate(rows[0]);
}

export async function deleteTemplate(db: Database, id: string): Promise<void> {
  assertId(id, 'id');
  const now = nowTimestamp();
  await db.execute(
    'UPDATE page_templates SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND deleted_at IS NULL',
    [now, now, id],
  );
}

/**
 * Insert the bundled default templates the planner is still missing (one live default per type),
 * or only those of `onlyTypes` when given. Returns only the templates inserted by this call, so a
 * second call returns [].
 */
export async function seedDefaultTemplates(
  db: Database,
  plannerId: string,
  profileId: string,
  onlyTypes?: readonly TemplateType[],
): Promise<PageTemplate[]> {
  assertId(plannerId, 'planner_id');
  const inserted: PageTemplate[] = [];
  for (const bundled of BUNDLED_DEFAULT_TEMPLATES) {
    const type = bundled.template_type;
    if (!isTemplateType(type)) throw new Error(`invalid template_type: ${type}`);
    if (onlyTypes !== undefined && !onlyTypes.includes(type)) continue;
    validateTemplateContent(bundled.content);
    if ((await findDefaultTemplate(db, plannerId, type)) !== null) continue;
    inserted.push(
      await saveTemplate(db, {
        planner_id: plannerId,
        profile_id: profileId,
        name: bundled.name,
        template_type: type,
        is_default: true,
        content: bundled.content,
      }),
    );
  }
  return inserted;
}

/** The shape the page loaders hand to the renderers. */
export function toTemplateRecord(t: PageTemplate): TemplateRecord {
  return {
    id: t.id,
    name: t.name,
    template_type: t.template_type,
    is_default: t.is_default,
    user_id: t.profile_id,
    planner_id: t.planner_id,
    content: t.content,
  };
}

/** The bundled default for a type, for callers that want to compare or display it. */
export function bundledDefaultTemplate(templateType: TemplateType): BundledTemplate | null {
  return BUNDLED_DEFAULT_TEMPLATES.find(t => t.template_type === templateType) ?? null;
}
