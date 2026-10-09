import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SqlJsDatabase } from '../db/adapters/sqljs.ts';
import { createTestDb } from '../db/testing.ts';
import { nowTimestamp } from './dates.ts';
import { deleteEntry, entriesBetween, getEntry, listEntries, upsertEntry } from './entries.ts';
import { isId, newId } from './ids.ts';
import { createPlanner } from './planners.ts';
import { findDefaultTemplate } from './templates.ts';
import type { EntryContent, Planner } from './types.ts';

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** A planner with its default templates and one weekly page row, inserted by hand. */
async function seedPage(db: SqlJsDatabase): Promise<{ pageId: string; planner: Planner }> {
  const planner = await createPlanner(db, { name: 'P' });
  const template = await findDefaultTemplate(db, planner.id, 'weekly_left');
  if (template === null) throw new Error('seeding failed');
  const pageId = newId();
  const now = nowTimestamp();
  await db.execute(
    `INSERT INTO pages (id, planner_id, profile_id, page_template_id, page_type, period_identifier, page_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pageId, planner.id, planner.profile_id, template.id, 'weekly', '41_2025_l', '2025-10-06', now, now],
  );
  return { pageId, planner };
}

describe('entries', () => {
  let db: SqlJsDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.close();
  });

  it('inserts an entry and returns exactly the PlannerEntry shape', async () => {
    const { pageId, planner } = await seedPage(db);
    const content: EntryContent = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] };

    const entry = await upsertEntry(db, { page_id: pageId, tiptap_id: '3', entry_date: '2025-10-08', content });
    expect(entry).toStrictEqual({
      id: expect.any(String),
      page_id: pageId,
      planner_id: planner.id,
      profile_id: planner.profile_id,
      tiptap_id: '3',
      entry_date: '2025-10-08',
      content,
      created_at: expect.stringMatching(TIMESTAMP),
      updated_at: entry.created_at,
      version: 1,
    });
    expect(isId(entry.id)).toBe(true);
    // Parsed from the row, not the caller's object.
    expect(entry.content).not.toBe(content);
    expect(await getEntry(db, pageId, '3')).toStrictEqual(entry);

    const raw = await db.select('SELECT content, deleted_at FROM planner_entries WHERE id = ?', [entry.id]);
    expect(raw).toEqual([{ content: JSON.stringify(content), deleted_at: null }]);
  });

  it('updates the same slot in place: same id, version 2, new content and date', async () => {
    const { pageId } = await seedPage(db);
    const first = await upsertEntry(db, { page_id: pageId, tiptap_id: '3', entry_date: '2025-10-08', content: { v: 1 } });
    const second = await upsertEntry(db, { page_id: pageId, tiptap_id: '3', entry_date: '2025-10-09', content: { v: 2 } });
    expect(second).toStrictEqual({
      ...first,
      entry_date: '2025-10-09',
      content: { v: 2 },
      updated_at: expect.stringMatching(TIMESTAMP),
      version: 2,
    });
    expect(await db.select('SELECT count(*) AS n FROM planner_entries')).toEqual([{ n: 1 }]);

    const third = await upsertEntry(db, { page_id: pageId, tiptap_id: '3', entry_date: '2025-10-09', content: { v: 3 } });
    expect(third.version).toBe(3);
    expect(third.created_at).toBe(first.created_at);

    // Another slot on the same page is another row.
    const other = await upsertEntry(db, { page_id: pageId, tiptap_id: '4', entry_date: '2025-10-09', content: { v: 1 } });
    expect(other.id).not.toBe(first.id);
    expect(other.version).toBe(1);
    expect(await db.select('SELECT count(*) AS n FROM planner_entries')).toEqual([{ n: 2 }]);
  });

  it('keeps the same slot on different pages apart', async () => {
    const a = await seedPage(db);
    const b = await seedPage(db);
    const onA = await upsertEntry(db, { page_id: a.pageId, tiptap_id: '1', entry_date: '2025-10-06', content: { on: 'a' } });
    const onB = await upsertEntry(db, { page_id: b.pageId, tiptap_id: '1', entry_date: '2025-10-06', content: { on: 'b' } });
    expect(onA.id).not.toBe(onB.id);
    expect(onB.planner_id).toBe(b.planner.id);
    expect((await listEntries(db, { page_id: a.pageId })).map(e => e.content)).toEqual([{ on: 'a' }]);
    expect((await listEntries(db, { page_id: b.pageId })).map(e => e.content)).toEqual([{ on: 'b' }]);
  });

  it('rejects bad input with exact messages and writes nothing', async () => {
    const { pageId } = await seedPage(db);
    const good = { page_id: pageId, tiptap_id: '1', entry_date: '2025-10-08', content: { v: 1 } };

    await expect(upsertEntry(db, { ...good, page_id: 'nope' })).rejects.toThrow('invalid page_id (expected UUID)');
    await expect(upsertEntry(db, { ...good, page_id: newId() })).rejects.toThrow('page not found');
    await expect(upsertEntry(db, { ...good, entry_date: '2025-13-01' })).rejects.toThrow(
      'invalid entry_date (expected YYYY-MM-DD)',
    );
    await expect(upsertEntry(db, { ...good, entry_date: '2025-02-29' })).rejects.toThrow(
      'invalid entry_date (expected YYYY-MM-DD)',
    );
    await expect(upsertEntry(db, { ...good, entry_date: '10/08/2025' })).rejects.toThrow(
      'invalid entry_date (expected YYYY-MM-DD)',
    );
    await expect(upsertEntry(db, { ...good, entry_date: undefined as unknown as string })).rejects.toThrow(
      'invalid entry_date (expected YYYY-MM-DD)',
    );
    await expect(upsertEntry(db, { ...good, tiptap_id: '' })).rejects.toThrow('tiptap_id must be present');
    await expect(upsertEntry(db, { ...good, tiptap_id: '   ' })).rejects.toThrow('tiptap_id must be present');
    await expect(upsertEntry(db, { ...good, tiptap_id: 3 as unknown as string })).rejects.toThrow('tiptap_id must be present');
    await expect(upsertEntry(db, { ...good, content: [] as unknown as EntryContent })).rejects.toThrow(
      'content must be a JSON object',
    );
    await expect(upsertEntry(db, { ...good, content: '<p>hi</p>' as unknown as EntryContent })).rejects.toThrow(
      'content must be a JSON object',
    );
    await expect(upsertEntry(db, { ...good, content: null as unknown as EntryContent })).rejects.toThrow(
      'content must be a JSON object',
    );
    expect(await listEntries(db, { page_id: pageId })).toEqual([]);
  });

  it('treats a soft-deleted page as missing', async () => {
    const { pageId } = await seedPage(db);
    await db.execute('UPDATE pages SET deleted_at = ? WHERE id = ?', ['2026-01-01T00:00:00.000Z', pageId]);
    await expect(
      upsertEntry(db, { page_id: pageId, tiptap_id: '1', entry_date: '2025-10-08', content: {} }),
    ).rejects.toThrow('page not found');
  });

  it("lists a page's entries by date then slot, optionally one slot", async () => {
    const { pageId } = await seedPage(db);
    const other = await seedPage(db);
    await upsertEntry(db, { page_id: pageId, tiptap_id: '2', entry_date: '2025-10-07', content: { v: 'b' } });
    await upsertEntry(db, { page_id: pageId, tiptap_id: '1', entry_date: '2025-10-07', content: { v: 'a' } });
    await upsertEntry(db, { page_id: pageId, tiptap_id: '7', entry_date: '2025-10-06', content: { v: 'c' } });
    await upsertEntry(db, { page_id: other.pageId, tiptap_id: '1', entry_date: '2025-10-06', content: { v: 'other' } });

    const all = await listEntries(db, { page_id: pageId });
    expect(all.map(e => [e.tiptap_id, e.entry_date])).toEqual([
      ['7', '2025-10-06'],
      ['1', '2025-10-07'],
      ['2', '2025-10-07'],
    ]);
    expect((await listEntries(db, { page_id: pageId, tiptap_id: '1' })).map(e => e.content)).toEqual([{ v: 'a' }]);
    expect(await listEntries(db, { page_id: pageId, tiptap_id: '9' })).toEqual([]);
    expect(await getEntry(db, pageId, '9')).toBeNull();
    expect(await getEntry(db, newId(), '1')).toBeNull();
    await expect(listEntries(db, { page_id: 'nope' })).rejects.toThrow('invalid page_id (expected UUID)');
  });

  it('groups entries between two dates, inclusive, in creation order within a day', async () => {
    const { pageId } = await seedPage(db);
    vi.useFakeTimers({ toFake: ['Date'] });

    vi.setSystemTime(new Date('2026-10-08T12:00:00.000Z'));
    const createdFirst = await upsertEntry(db, { page_id: pageId, tiptap_id: '2', entry_date: '2025-10-07', content: { v: 'first' } });
    vi.setSystemTime(new Date('2026-10-08T12:00:01.000Z'));
    const createdSecond = await upsertEntry(db, { page_id: pageId, tiptap_id: '1', entry_date: '2025-10-07', content: { v: 'second' } });
    vi.setSystemTime(new Date('2026-10-08T12:00:02.000Z'));
    const monday = await upsertEntry(db, { page_id: pageId, tiptap_id: '7', entry_date: '2025-10-06', content: { v: 'monday' } });
    const sunday = await upsertEntry(db, { page_id: pageId, tiptap_id: '6', entry_date: '2025-10-12', content: { v: 'sunday' } });
    await upsertEntry(db, { page_id: pageId, tiptap_id: '3', entry_date: '2025-10-05', content: { v: 'before' } });
    await upsertEntry(db, { page_id: pageId, tiptap_id: '4', entry_date: '2025-10-13', content: { v: 'after' } });
    await upsertEntry(db, { page_id: pageId, tiptap_id: '5', entry_date: '2025-10-08', content: { v: 'deleted' } });
    await deleteEntry(db, pageId, '5');

    // Updating the earlier-created entry does not reorder it: the group follows created_at.
    vi.setSystemTime(new Date('2026-10-08T12:00:03.000Z'));
    const updatedFirst = await upsertEntry(db, { page_id: pageId, tiptap_id: '2', entry_date: '2025-10-07', content: { v: 'first, edited' } });

    const grouped = await entriesBetween(db, pageId, '2025-10-06', '2025-10-12');
    expect(Object.keys(grouped)).toEqual(['2025-10-06', '2025-10-07', '2025-10-12']);
    expect(grouped).toStrictEqual({
      '2025-10-06': [{ id: monday.id, content: { v: 'monday' }, entry_date: '2025-10-06', updated_at: monday.updated_at }],
      '2025-10-07': [
        { id: createdFirst.id, content: { v: 'first, edited' }, entry_date: '2025-10-07', updated_at: updatedFirst.updated_at },
        { id: createdSecond.id, content: { v: 'second' }, entry_date: '2025-10-07', updated_at: createdSecond.updated_at },
      ],
      '2025-10-12': [{ id: sunday.id, content: { v: 'sunday' }, entry_date: '2025-10-12', updated_at: sunday.updated_at }],
    });
    expect(updatedFirst.updated_at).toBe('2026-10-08T12:00:03.000Z');

    // Both ends are inclusive; a range with nothing in it is an empty object.
    expect(Object.keys(await entriesBetween(db, pageId, '2025-10-05', '2025-10-13'))).toEqual([
      '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-12', '2025-10-13',
    ]);
    expect(Object.keys(await entriesBetween(db, pageId, '2025-10-07', '2025-10-07'))).toEqual(['2025-10-07']);
    expect(await entriesBetween(db, pageId, '2025-11-01', '2025-11-30')).toEqual({});
    expect(await entriesBetween(db, newId(), '2025-10-06', '2025-10-12')).toEqual({});

    await expect(entriesBetween(db, 'nope', '2025-10-06', '2025-10-12')).rejects.toThrow('invalid page_id (expected UUID)');
    await expect(entriesBetween(db, pageId, '2025-10-6', '2025-10-12')).rejects.toThrow(/invalid start/);
    await expect(entriesBetween(db, pageId, '2025-10-06', 'later')).rejects.toThrow(/invalid end/);
  });

  it('soft-deletes an entry and revives it with its id on the next save', async () => {
    const { pageId } = await seedPage(db);
    const entry = await upsertEntry(db, { page_id: pageId, tiptap_id: '1', entry_date: '2025-10-06', content: { v: 1 } });
    const kept = await upsertEntry(db, { page_id: pageId, tiptap_id: '2', entry_date: '2025-10-06', content: { v: 1 } });

    await deleteEntry(db, pageId, '1');
    expect(await getEntry(db, pageId, '1')).toBeNull();
    expect((await listEntries(db, { page_id: pageId })).map(e => e.id)).toEqual([kept.id]);
    expect(await db.select('SELECT deleted_at, version FROM planner_entries WHERE id = ?', [entry.id])).toEqual([
      { deleted_at: expect.stringMatching(TIMESTAMP), version: 2 },
    ]);

    // Deleting again, or a slot that never existed, is a no-op.
    await deleteEntry(db, pageId, '1');
    await deleteEntry(db, pageId, '9');
    expect(await db.select('SELECT version FROM planner_entries WHERE id = ?', [entry.id])).toEqual([{ version: 2 }]);
    await expect(deleteEntry(db, 'nope', '1')).rejects.toThrow('invalid page_id (expected UUID)');

    const revived = await upsertEntry(db, { page_id: pageId, tiptap_id: '1', entry_date: '2025-10-07', content: { v: 2 } });
    expect(revived).toStrictEqual({
      ...entry,
      entry_date: '2025-10-07',
      content: { v: 2 },
      updated_at: expect.stringMatching(TIMESTAMP),
      version: 3,
    });
    expect(await db.select('SELECT deleted_at FROM planner_entries WHERE id = ?', [entry.id])).toEqual([
      { deleted_at: null },
    ]);
    // listEntries orders by entry_date then tiptap_id, and the revive moved the entry to the 7th.
    expect((await listEntries(db, { page_id: pageId })).map(e => e.id)).toEqual([kept.id, entry.id]);
  });
});
