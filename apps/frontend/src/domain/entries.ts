/**
 * Planner entries: the TipTap documents typed into a page's editor slots. A slot is named by
 * `tiptap_id` ("1" … "7" on a weekly page, "1" … "42" on a monthly one).
 *
 * Why it is shaped this way:
 *   - UNIQUE(page_id, tiptap_id) makes a save one INSERT ... ON CONFLICT DO UPDATE, so the
 *     editor's autosave never duplicates a slot, and a slot whose entry was soft-deleted comes
 *     back on the next save. The row id therefore survives every save: the first write mints it
 *     and later writes keep it (the fresh id passed to the INSERT is discarded on conflict).
 *   - `entry_date` is required and must be a real calendar date. The Rust command quietly
 *     substituted today's date when it was missing, which misfiled entries.
 *   - planner_id and profile_id are copied from the page rather than trusted from the caller, so
 *     an entry can never disagree with its page.
 *   - `entriesBetween` returns the grouped shape the weekly and monthly routes consume
 *     ({ "YYYY-MM-DD": [{ id, content, entry_date, updated_at }] }). Keys are inserted in
 *     ascending date order, which JS preserves for non-numeric string keys, and each day's list
 *     is in creation order like the Rust build's.
 */

import type { Database, SqlParam } from '../db/Database.ts';
import { assertISODate, isISODate, nowTimestamp, type ISODate } from './dates.ts';
import { assertId, newId } from './ids.ts';
import type { EntryContent, EntryRecord, GroupedEntries, PlannerEntry } from './types.ts';

type EntryRow = {
  id: string;
  page_id: string;
  planner_id: string;
  profile_id: string;
  tiptap_id: string;
  entry_date: string;
  content: string;
  created_at: string;
  updated_at: string;
  version: number;
};

const COLUMNS =
  'id, page_id, planner_id, profile_id, tiptap_id, entry_date, content, created_at, updated_at, version';

export interface EntryFilter {
  page_id: string;
  tiptap_id?: string;
}

export interface UpsertEntryInput {
  page_id: string;
  tiptap_id: string;
  entry_date: ISODate;
  content: EntryContent;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toEntry(row: EntryRow): PlannerEntry {
  return {
    id: row.id,
    page_id: row.page_id,
    planner_id: row.planner_id,
    profile_id: row.profile_id,
    tiptap_id: row.tiptap_id,
    entry_date: row.entry_date,
    content: JSON.parse(row.content) as EntryContent,
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

/** A page's live entries, optionally one slot, ordered by date then slot. */
export async function listEntries(db: Database, filter: EntryFilter): Promise<PlannerEntry[]> {
  const params: SqlParam[] = [assertId(filter.page_id, 'page_id')];
  let where = 'page_id = ? AND deleted_at IS NULL';
  if (filter.tiptap_id !== undefined) {
    where += ' AND tiptap_id = ?';
    params.push(filter.tiptap_id);
  }
  const rows = await db.select<EntryRow>(
    `SELECT ${COLUMNS} FROM planner_entries WHERE ${where} ORDER BY entry_date, tiptap_id`,
    params,
  );
  return rows.map(toEntry);
}

export async function getEntry(db: Database, pageId: string, tiptapId: string): Promise<PlannerEntry | null> {
  const rows = await db.select<EntryRow>(
    `SELECT ${COLUMNS} FROM planner_entries WHERE page_id = ? AND tiptap_id = ? AND deleted_at IS NULL`,
    [pageId, tiptapId],
  );
  return rows.length > 0 ? toEntry(rows[0]) : null;
}

/** The page's live entries dated within [start, end], grouped by day for the page loaders. */
export async function entriesBetween(
  db: Database,
  pageId: string,
  start: ISODate,
  end: ISODate,
): Promise<GroupedEntries> {
  assertId(pageId, 'page_id');
  assertISODate(start, 'start');
  assertISODate(end, 'end');
  const rows = await db.select<EntryRow>(
    `SELECT ${COLUMNS} FROM planner_entries
     WHERE page_id = ? AND entry_date >= ? AND entry_date <= ? AND deleted_at IS NULL
     ORDER BY entry_date, created_at, id`,
    [pageId, start, end],
  );
  const grouped: GroupedEntries = {};
  for (const row of rows) {
    const record: EntryRecord = {
      id: row.id,
      content: JSON.parse(row.content) as EntryContent,
      entry_date: row.entry_date,
      updated_at: row.updated_at,
    };
    const day = grouped[row.entry_date];
    if (day) day.push(record);
    else grouped[row.entry_date] = [record];
  }
  return grouped;
}

/** Create or replace the entry in a page's slot, in one statement. Returns the stored row. */
export async function upsertEntry(db: Database, input: UpsertEntryInput): Promise<PlannerEntry> {
  const pageId = assertId(input.page_id, 'page_id');
  if (typeof input.tiptap_id !== 'string' || input.tiptap_id.trim().length === 0) {
    throw new Error('tiptap_id must be present');
  }
  if (!isISODate(input.entry_date)) throw new Error('invalid entry_date (expected YYYY-MM-DD)');
  if (!isJsonObject(input.content)) throw new Error('content must be a JSON object');

  const owner = await pageOwner(db, pageId);
  const now = nowTimestamp();
  await db.execute(
    `INSERT INTO planner_entries
       (id, page_id, planner_id, profile_id, tiptap_id, entry_date, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(page_id, tiptap_id) DO UPDATE SET
       content = excluded.content,
       entry_date = excluded.entry_date,
       updated_at = excluded.updated_at,
       version = planner_entries.version + 1,
       deleted_at = NULL`,
    [
      newId(),
      pageId,
      owner.planner_id,
      owner.profile_id,
      input.tiptap_id,
      input.entry_date,
      JSON.stringify(input.content),
      now,
      now,
    ],
  );
  const entry = await getEntry(db, pageId, input.tiptap_id);
  if (entry === null) throw new Error('planner entry not found after save');
  return entry;
}

/** Soft delete. Deleting a missing or already deleted entry is a no-op. */
export async function deleteEntry(db: Database, pageId: string, tiptapId: string): Promise<void> {
  assertId(pageId, 'page_id');
  const now = nowTimestamp();
  await db.execute(
    `UPDATE planner_entries SET deleted_at = ?, updated_at = ?, version = version + 1
     WHERE page_id = ? AND tiptap_id = ? AND deleted_at IS NULL`,
    [now, now, pageId, tiptapId],
  );
}
