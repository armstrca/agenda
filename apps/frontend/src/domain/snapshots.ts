/**
 * tldraw snapshots: one drawing layer per page (UNIQUE page_id) holding only the `document` half
 * of tldraw's getSnapshot(). Camera and selection are session state and are not persisted.
 *
 * Why it is shaped this way:
 *   - Saving is one INSERT ... ON CONFLICT(page_id) DO UPDATE, so autosave from the canvas never
 *     races itself into two rows, and a soft-deleted layer is revived (deleted_at = NULL) by the
 *     next save, keeping its id. planner_id and profile_id come from the page, not the caller.
 *   - `listSnapshots` returns the array shape the TLDraw component reads
 *     (`tldraw_snapshots[0].document_data`). The key stays `document_data` for that reason even
 *     though the column is `document`. The array has zero or one element.
 */

import type { Database } from '../db/Database.ts';
import { nowTimestamp } from './dates.ts';
import { assertId, newId } from './ids.ts';
import type { SnapshotRecord, TldrawDocument, TldrawSnapshot } from './types.ts';

type SnapshotRow = {
  id: string;
  page_id: string;
  planner_id: string;
  profile_id: string;
  document: string;
  schema: string | null;
  created_at: string;
  updated_at: string;
  version: number;
};

const COLUMNS = 'id, page_id, planner_id, profile_id, document, schema, created_at, updated_at, version';

export interface SaveSnapshotInput {
  page_id: string;
  document: TldrawDocument;
  schema?: Record<string, unknown> | null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toSnapshot(row: SnapshotRow): TldrawSnapshot {
  return {
    id: row.id,
    page_id: row.page_id,
    planner_id: row.planner_id,
    profile_id: row.profile_id,
    document: JSON.parse(row.document) as TldrawDocument,
    schema: row.schema === null ? null : (JSON.parse(row.schema) as Record<string, unknown>),
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

/** The live page's owners, or "page not found". */
async function pageOwner(db: Database, pageId: string): Promise<{ planner_id: string; profile_id: string }> {
  const rows = await db.select<{ planner_id: string; profile_id: string }>(
    'SELECT planner_id, profile_id FROM pages WHERE id = ? AND deleted_at IS NULL',
    [pageId],
  );
  if (rows.length === 0) throw new Error('page not found');
  return rows[0];
}

export async function getSnapshot(db: Database, pageId: string): Promise<TldrawSnapshot | null> {
  const rows = await db.select<SnapshotRow>(
    `SELECT ${COLUMNS} FROM tldraw_snapshots WHERE page_id = ? AND deleted_at IS NULL`,
    [pageId],
  );
  return rows.length > 0 ? toSnapshot(rows[0]) : null;
}

/** The page's snapshot in the loader shape, as a zero- or one-element array. */
export async function listSnapshots(db: Database, pageId: string): Promise<SnapshotRecord[]> {
  const snapshot = await getSnapshot(db, assertId(pageId, 'page_id'));
  if (snapshot === null) return [];
  return [
    {
      id: snapshot.id,
      document_data: snapshot.document,
      schema: snapshot.schema,
      updated_at: snapshot.updated_at,
    },
  ];
}

/** Create or replace the page's snapshot in one statement. Returns the stored row. */
export async function saveSnapshot(db: Database, input: SaveSnapshotInput): Promise<TldrawSnapshot> {
  const pageId = assertId(input.page_id, 'page_id');
  if (!isJsonObject(input.document)) throw new Error('document must be a JSON object');
  const schema = input.schema === undefined ? null : input.schema;
  if (schema !== null && !isJsonObject(schema)) throw new Error('schema must be a JSON object');

  const owner = await pageOwner(db, pageId);
  const now = nowTimestamp();
  await db.execute(
    `INSERT INTO tldraw_snapshots
       (id, page_id, planner_id, profile_id, document, schema, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(page_id) DO UPDATE SET
       document = excluded.document,
       schema = excluded.schema,
       updated_at = excluded.updated_at,
       version = tldraw_snapshots.version + 1,
       deleted_at = NULL`,
    [
      newId(),
      pageId,
      owner.planner_id,
      owner.profile_id,
      JSON.stringify(input.document),
      schema === null ? null : JSON.stringify(schema),
      now,
      now,
    ],
  );
  const snapshot = await getSnapshot(db, pageId);
  if (snapshot === null) throw new Error('snapshot not found after save');
  return snapshot;
}

/** Soft delete. Deleting a missing or already deleted snapshot is a no-op. */
export async function deleteSnapshot(db: Database, pageId: string): Promise<void> {
  assertId(pageId, 'page_id');
  const now = nowTimestamp();
  await db.execute(
    `UPDATE tldraw_snapshots SET deleted_at = ?, updated_at = ?, version = version + 1
     WHERE page_id = ? AND deleted_at IS NULL`,
    [now, now, pageId],
  );
}
