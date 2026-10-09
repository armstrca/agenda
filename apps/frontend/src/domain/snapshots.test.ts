import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SqlJsDatabase } from '../db/adapters/sqljs.ts';
import { createTestDb } from '../db/testing.ts';
import { nowTimestamp } from './dates.ts';
import { isId, newId } from './ids.ts';
import { createPlanner } from './planners.ts';
import { deleteSnapshot, getSnapshot, listSnapshots, saveSnapshot } from './snapshots.ts';
import { findDefaultTemplate } from './templates.ts';
import type { Planner, TldrawDocument } from './types.ts';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const DOCUMENT: TldrawDocument = {
  store: { 'shape:abc': { id: 'shape:abc', type: 'draw', x: 1, y: 2 } },
  schema: { schemaVersion: 2 },
};

/** A planner with its default templates and one monthly page row, inserted by hand. */
async function seedPage(db: SqlJsDatabase): Promise<{ pageId: string; planner: Planner }> {
  const planner = await createPlanner(db, { name: 'P' });
  const template = await findDefaultTemplate(db, planner.id, 'monthly');
  if (template === null) throw new Error('seeding failed');
  const pageId = newId();
  const now = nowTimestamp();
  await db.execute(
    `INSERT INTO pages (id, planner_id, profile_id, page_template_id, page_type, period_identifier, page_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pageId, planner.id, planner.profile_id, template.id, 'monthly', '10_2025', '2025-10-01', now, now],
  );
  return { pageId, planner };
}

describe('snapshots', () => {
  let db: SqlJsDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it('saves a snapshot and returns exactly the TldrawSnapshot shape', async () => {
    const { pageId, planner } = await seedPage(db);
    const snapshot = await saveSnapshot(db, { page_id: pageId, document: DOCUMENT });
    expect(snapshot).toStrictEqual({
      id: expect.any(String),
      page_id: pageId,
      planner_id: planner.id,
      profile_id: planner.profile_id,
      document: DOCUMENT,
      schema: null,
      created_at: expect.stringMatching(TIMESTAMP),
      updated_at: snapshot.created_at,
      version: 1,
    });
    expect(isId(snapshot.id)).toBe(true);
    expect(snapshot.document).not.toBe(DOCUMENT);
    expect(await getSnapshot(db, pageId)).toStrictEqual(snapshot);

    const raw = await db.select('SELECT document, schema, deleted_at FROM tldraw_snapshots WHERE id = ?', [snapshot.id]);
    expect(raw).toEqual([{ document: JSON.stringify(DOCUMENT), schema: null, deleted_at: null }]);
  });

  it('stores an optional schema object, and null clears it', async () => {
    const { pageId } = await seedPage(db);
    const schema = { schemaVersion: 2, sequences: { 'com.tldraw.store': 4 } };
    const withSchema = await saveSnapshot(db, { page_id: pageId, document: DOCUMENT, schema });
    expect(withSchema.schema).toEqual(schema);
    expect(await db.select('SELECT schema FROM tldraw_snapshots WHERE id = ?', [withSchema.id])).toEqual([
      { schema: JSON.stringify(schema) },
    ]);

    const cleared = await saveSnapshot(db, { page_id: pageId, document: DOCUMENT, schema: null });
    expect(cleared.schema).toBeNull();
    expect(cleared.id).toBe(withSchema.id);
  });

  it('upserts by page: a second save keeps the id and bumps the version', async () => {
    const { pageId } = await seedPage(db);
    const first = await saveSnapshot(db, { page_id: pageId, document: DOCUMENT });
    const next: TldrawDocument = { store: {}, schema: { schemaVersion: 2 } };
    const second = await saveSnapshot(db, { page_id: pageId, document: next });
    expect(second).toStrictEqual({
      ...first,
      document: next,
      updated_at: expect.stringMatching(TIMESTAMP),
      version: 2,
    });
    expect(await db.select('SELECT count(*) AS n FROM tldraw_snapshots')).toEqual([{ n: 1 }]);

    const third = await saveSnapshot(db, { page_id: pageId, document: DOCUMENT });
    expect(third.version).toBe(3);
    expect(third.created_at).toBe(first.created_at);

    // Another page has its own snapshot.
    const other = await seedPage(db);
    const theirs = await saveSnapshot(db, { page_id: other.pageId, document: DOCUMENT });
    expect(theirs.id).not.toBe(first.id);
    expect(theirs.planner_id).toBe(other.planner.id);
    expect(await db.select('SELECT count(*) AS n FROM tldraw_snapshots')).toEqual([{ n: 2 }]);
  });

  it('rejects bad input with exact messages and writes nothing', async () => {
    const { pageId } = await seedPage(db);
    await expect(saveSnapshot(db, { page_id: 'nope', document: DOCUMENT })).rejects.toThrow(
      'invalid page_id (expected UUID)',
    );
    await expect(saveSnapshot(db, { page_id: newId(), document: DOCUMENT })).rejects.toThrow('page not found');
    await expect(saveSnapshot(db, { page_id: pageId, document: [] as unknown as TldrawDocument })).rejects.toThrow(
      'document must be a JSON object',
    );
    await expect(saveSnapshot(db, { page_id: pageId, document: 'x' as unknown as TldrawDocument })).rejects.toThrow(
      'document must be a JSON object',
    );
    await expect(saveSnapshot(db, { page_id: pageId, document: null as unknown as TldrawDocument })).rejects.toThrow(
      'document must be a JSON object',
    );
    await expect(
      saveSnapshot(db, { page_id: pageId, document: DOCUMENT, schema: [] as unknown as Record<string, unknown> }),
    ).rejects.toThrow('schema must be a JSON object');
    expect(await getSnapshot(db, pageId)).toBeNull();
    expect(await db.select('SELECT count(*) AS n FROM tldraw_snapshots')).toEqual([{ n: 0 }]);
  });

  it('treats a soft-deleted page as missing', async () => {
    const { pageId } = await seedPage(db);
    await db.execute('UPDATE pages SET deleted_at = ? WHERE id = ?', ['2026-01-01T00:00:00.000Z', pageId]);
    await expect(saveSnapshot(db, { page_id: pageId, document: DOCUMENT })).rejects.toThrow('page not found');
  });

  it('listSnapshots returns the loader shape with the document under document_data', async () => {
    const { pageId } = await seedPage(db);
    expect(await listSnapshots(db, pageId)).toEqual([]);
    expect(await listSnapshots(db, newId())).toEqual([]);
    await expect(listSnapshots(db, 'nope')).rejects.toThrow('invalid page_id (expected UUID)');

    const schema = { schemaVersion: 2 };
    const snapshot = await saveSnapshot(db, { page_id: pageId, document: DOCUMENT, schema });
    expect(await listSnapshots(db, pageId)).toStrictEqual([
      { id: snapshot.id, document_data: DOCUMENT, schema, updated_at: snapshot.updated_at },
    ]);
  });

  it('soft-deletes a snapshot and revives it with its id on the next save', async () => {
    const { pageId } = await seedPage(db);
    const snapshot = await saveSnapshot(db, { page_id: pageId, document: DOCUMENT });

    await deleteSnapshot(db, pageId);
    expect(await getSnapshot(db, pageId)).toBeNull();
    expect(await listSnapshots(db, pageId)).toEqual([]);
    expect(await db.select('SELECT deleted_at, version FROM tldraw_snapshots WHERE id = ?', [snapshot.id])).toEqual([
      { deleted_at: expect.stringMatching(TIMESTAMP), version: 2 },
    ]);

    // Deleting again, or a page without a snapshot, is a no-op.
    await deleteSnapshot(db, pageId);
    await deleteSnapshot(db, newId());
    expect(await db.select('SELECT version FROM tldraw_snapshots WHERE id = ?', [snapshot.id])).toEqual([{ version: 2 }]);
    await expect(deleteSnapshot(db, 'nope')).rejects.toThrow('invalid page_id (expected UUID)');

    const next: TldrawDocument = { store: { 'shape:new': {} }, schema: {} };
    const revived = await saveSnapshot(db, { page_id: pageId, document: next });
    expect(revived).toStrictEqual({
      ...snapshot,
      document: next,
      updated_at: expect.stringMatching(TIMESTAMP),
      version: 3,
    });
    expect(await db.select('SELECT deleted_at FROM tldraw_snapshots WHERE id = ?', [snapshot.id])).toEqual([
      { deleted_at: null },
    ]);
    expect((await listSnapshots(db, pageId))[0]?.document_data).toEqual(next);
  });
});
