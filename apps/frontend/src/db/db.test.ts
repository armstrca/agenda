import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_PROFILE_ID } from '../domain/types.ts';
import { createSqlJsDatabase, type SqlJsDatabase } from './adapters/sqljs.ts';
import { runMigrations } from './migrate.ts';
import { MIGRATIONS } from './migrations/index.ts';
import { createTestDb } from './testing.ts';

const TABLES = [
  'events',
  'page_templates',
  'pages',
  'planner_entries',
  'planners',
  'profiles',
  'tldraw_snapshots',
];

const INSERT_PLANNER = 'INSERT INTO planners (id, profile_id, name) VALUES (?, ?, ?)';

async function tableNames(db: SqlJsDatabase): Promise<string[]> {
  const rows = await db.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map(r => r.name);
}

async function seedPlanner(db: SqlJsDatabase, id = 'planner-1'): Promise<void> {
  await db.execute(INSERT_PLANNER, [id, DEFAULT_PROFILE_ID, 'Test planner']);
}

async function seedPage(db: SqlJsDatabase): Promise<void> {
  await seedPlanner(db);
  await db.execute(
    `INSERT INTO page_templates (id, planner_id, profile_id, name, template_type, is_default, content)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['template-1', 'planner-1', DEFAULT_PROFILE_ID, 'Weekly left', 'weekly_left', 1, '{}'],
  );
  await db.execute(
    `INSERT INTO pages (id, planner_id, profile_id, page_template_id, page_type, period_identifier, page_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['page-1', 'planner-1', DEFAULT_PROFILE_ID, 'template-1', 'weekly', '40_2025_l', '2025-09-29'],
  );
}

describe('storage layer', () => {
  let db: SqlJsDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  afterEach(async () => {
    await db.close();
  });

  it('creates all seven tables from 0001_init.sql', async () => {
    expect(await tableNames(db)).toEqual([...TABLES, 'schema_migrations'].sort());
  });

  it('seeds the default profile', async () => {
    const rows = await db.select('SELECT id, name, version FROM profiles');
    expect(rows).toEqual([{ id: DEFAULT_PROFILE_ID, name: 'Default', version: 1 }]);
  });

  it('exposes the migration list built from the raw SQL files', () => {
    expect(MIGRATIONS.map(m => [m.version, m.name])).toEqual([
      [1, 'init'],
      [2, 'prefix_day_classes'],
      [3, 'rename_calendar_button'],
    ]);
    expect(MIGRATIONS[0].sql).toContain('CREATE TABLE profiles');
    expect(MIGRATIONS[1].sql).toContain('UPDATE page_templates');
    expect(MIGRATIONS[2].sql).toContain('w-calendar-button');
  });

  it('records applied migrations and is idempotent', async () => {
    const before = await db.select('SELECT version, name FROM schema_migrations ORDER BY version');
    expect(before).toEqual(MIGRATIONS.map(m => ({ version: m.version, name: m.name })));

    expect(await runMigrations(db)).toEqual([]);

    const after = await db.select('SELECT version, name FROM schema_migrations ORDER BY version');
    expect(after).toEqual(before);
  });

  it('applies only pending migrations, in version order, even without a trailing semicolon', async () => {
    const latest = MIGRATIONS[MIGRATIONS.length - 1].version;
    const extended = [
      ...MIGRATIONS,
      { version: latest + 2, name: 'second', sql: 'CREATE TABLE second (id INTEGER PRIMARY KEY)' },
      { version: latest + 1, name: 'first', sql: 'CREATE TABLE first (id INTEGER PRIMARY KEY);\n-- trailing comment' },
    ];
    expect(await runMigrations(db, extended)).toEqual([latest + 1, latest + 2]);
    expect(await tableNames(db)).toContain('first');
    expect(await tableNames(db)).toContain('second');
    expect(await runMigrations(db, extended)).toEqual([]);

    const recorded = await db.select<{ version: number; name: string; applied_at: string }>(
      'SELECT version, name, applied_at FROM schema_migrations ORDER BY version',
    );
    expect(recorded.map(r => [r.version, r.name])).toEqual([
      ...MIGRATIONS.map(m => [m.version, m.name]),
      [latest + 1, 'first'],
      [latest + 2, 'second'],
    ]);
    expect(recorded[recorded.length - 1].applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('rolls back a failing migration and records nothing for it', async () => {
    const next = MIGRATIONS[MIGRATIONS.length - 1].version + 1;
    const broken = [
      ...MIGRATIONS,
      { version: next, name: 'broken', sql: 'CREATE TABLE half (id INTEGER PRIMARY KEY);\nTHIS IS NOT SQL;' },
    ];
    await expect(runMigrations(db, broken)).rejects.toThrow(new RegExp(`migration ${next} \\(broken\\) failed`));

    expect(await tableNames(db)).not.toContain('half');
    expect(await db.select('SELECT version FROM schema_migrations ORDER BY version')).toEqual(
      MIGRATIONS.map(m => ({ version: m.version })),
    );

    // No transaction is left dangling: ordinary writes work afterwards.
    await seedPlanner(db);
    expect(await db.select('SELECT count(*) AS n FROM planners')).toEqual([{ n: 1 }]);
  });

  it('rejects malformed migration lists before touching the database', async () => {
    const one = { version: 1, name: 'a', sql: 'SELECT 1' };
    await expect(runMigrations(db, [one, { ...one, name: 'b' }])).rejects.toThrow(
      /duplicate migration version: 1/,
    );
    await expect(runMigrations(db, [{ ...one, version: 0 }])).rejects.toThrow(/invalid migration version/);
    await expect(runMigrations(db, [{ ...one, version: 2, name: '' }])).rejects.toThrow(/has no name/);
    await expect(runMigrations(db, [{ ...one, version: 2, sql: '  ' }])).rejects.toThrow(/has no SQL/);
  });

  it('enforces foreign keys', async () => {
    await expect(db.execute(INSERT_PLANNER, ['p', 'no-such-profile', 'x'])).rejects.toThrow(/FOREIGN KEY/);
    expect(await db.select('SELECT id FROM planners')).toEqual([]);
  });

  it('cascades deletes through the foreign keys', async () => {
    await seedPage(db);
    await db.execute('DELETE FROM planners WHERE id = ?', ['planner-1']);
    expect(await db.select('SELECT id FROM pages')).toEqual([]);
    expect(await db.select('SELECT id FROM page_templates')).toEqual([]);
  });

  it('upserts planner_entries on (page_id, tiptap_id) instead of duplicating', async () => {
    await seedPage(db);
    const upsert = `
      INSERT INTO planner_entries (id, page_id, planner_id, profile_id, tiptap_id, entry_date, content, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(page_id, tiptap_id) DO UPDATE SET
        content = excluded.content,
        entry_date = excluded.entry_date,
        updated_at = excluded.updated_at,
        version = planner_entries.version + 1`;
    const base = ['page-1', 'planner-1', DEFAULT_PROFILE_ID, '3'];

    const first = await db.execute(upsert, ['entry-1', ...base, '2025-10-01', '{"v":1}', '2025-10-01T10:00:00.000Z']);
    const second = await db.execute(upsert, ['entry-2', ...base, '2025-10-02', '{"v":2}', '2025-10-02T10:00:00.000Z']);
    expect(first.rowsAffected).toBe(1);
    expect(second.rowsAffected).toBe(1);

    const rows = await db.select('SELECT id, tiptap_id, entry_date, content, version FROM planner_entries');
    expect(rows).toEqual([
      { id: 'entry-1', tiptap_id: '3', entry_date: '2025-10-02', content: '{"v":2}', version: 2 },
    ]);
  });

  it('INSERT OR IGNORE on pages reports rowsAffected 0 the second time and keeps one row', async () => {
    await seedPage(db);
    const insert = `
      INSERT OR IGNORE INTO pages (id, planner_id, profile_id, page_template_id, page_type, period_identifier, page_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`;
    const params = ['page-2', 'planner-1', DEFAULT_PROFILE_ID, 'template-1', 'weekly', '41_2025_l', '2025-10-06'];

    expect((await db.execute(insert, params)).rowsAffected).toBe(1);
    expect((await db.execute(insert, params)).rowsAffected).toBe(0);
    // Same period under a different id is the same page: the UNIQUE constraint ignores it too.
    expect((await db.execute(insert, ['page-3', ...params.slice(1)])).rowsAffected).toBe(0);

    expect(await db.select('SELECT id FROM pages WHERE period_identifier = ?', ['41_2025_l'])).toEqual([
      { id: 'page-2' },
    ]);
  });

  it('binds numbers, strings and null and reads them back typed', async () => {
    await db.executeScript('CREATE TABLE typed (i INTEGER, t TEXT, n TEXT, r REAL)');
    await db.execute('INSERT INTO typed (i, t, n, r) VALUES (?, ?, ?, ?)', [42, "it's", null, 1.5]);

    const rows = await db.select('SELECT i, t, n, r FROM typed');
    expect(rows).toEqual([{ i: 42, t: "it's", n: null, r: 1.5 }]);
    expect(typeof rows[0].i).toBe('number');
    expect(typeof rows[0].t).toBe('string');
    expect(rows[0].n).toBeNull();

    expect(await db.select('SELECT i FROM typed WHERE t = ? AND n IS ?', ["it's", null])).toEqual([{ i: 42 }]);
    expect(await db.select('SELECT i FROM typed WHERE i = ?', [43])).toEqual([]);
  });

  it('returns [] for a select with no rows', async () => {
    expect(await db.select('SELECT * FROM planners WHERE id = ?', ['nothing'])).toEqual([]);
    expect(await db.select('SELECT * FROM events')).toEqual([]);
  });

  it('calls onChange once per write and never for reads', async () => {
    let changes = 0;
    const tracked = await createSqlJsDatabase({
      onChange: () => {
        changes += 1;
      },
    });
    try {
      await runMigrations(tracked);
      changes = 0;

      await seedPlanner(tracked);
      expect(changes).toBe(1);

      await tracked.select('SELECT id FROM planners');
      expect(changes).toBe(1);

      await tracked.executeScript('CREATE TABLE a (x); CREATE TABLE b (y);');
      expect(changes).toBe(2);

      await expect(tracked.execute(INSERT_PLANNER, ['p', 'nope', 'x'])).rejects.toThrow();
      expect(changes).toBe(2);
    } finally {
      await tracked.close();
    }
  });

  it('round-trips exportBytes() into a new database with the data intact', async () => {
    await seedPage(db);
    const bytes = db.exportBytes();
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const copy = await createSqlJsDatabase({ initialData: bytes });
    try {
      expect(await tableNames(copy)).toEqual(await tableNames(db));
      expect(await copy.select('SELECT id, name FROM planners')).toEqual([{ id: 'planner-1', name: 'Test planner' }]);
      expect(await copy.select('SELECT id, period_identifier FROM pages')).toEqual([
        { id: 'page-1', period_identifier: '40_2025_l' },
      ]);
      // The bookkeeping travelled with the image, so nothing is re-applied.
      expect(await runMigrations(copy)).toEqual([]);
      // A database opened from bytes enforces references like a fresh one.
      await expect(copy.execute(INSERT_PLANNER, ['p', 'nope', 'x'])).rejects.toThrow(/FOREIGN KEY/);
    } finally {
      await copy.close();
    }
  });

  it('still enforces foreign keys after exportBytes() reopened the connection', async () => {
    db.exportBytes();
    await expect(db.execute(INSERT_PLANNER, ['p', 'nope', 'x'])).rejects.toThrow(/FOREIGN KEY/);
    await seedPlanner(db);
    expect(await db.select('SELECT count(*) AS n FROM planners')).toEqual([{ n: 1 }]);
  });

  it('close() is idempotent and later calls fail clearly', async () => {
    const fresh = await createTestDb();
    await fresh.close();
    await fresh.close();
    await expect(fresh.select('SELECT 1')).rejects.toThrow(/closed/);
    await expect(fresh.execute('SELECT 1')).rejects.toThrow(/closed/);
    expect(() => fresh.exportBytes()).toThrow(/closed/);
  });
});

describe('migration 0002: prefix day classes', () => {
  const OLD = (cls: string[]) =>
    JSON.stringify({ metadata: {}, structure: cls.map(c => ({ class: c, component: 'div' })) });
  const SPACED = '{"structure": [{"class": "day-name"}, {"class": "day-number"}]}';

  it('rewrites saved templates by page type and leaves other classes alone', async () => {
    const db = await createSqlJsDatabase();
    await runMigrations(db, MIGRATIONS.slice(0, 1));
    await seedPlanner(db);
    const rows: Array<[string, string, string]> = [
      ['wl', 'weekly_left', OLD(['day-number', 'day-name', 'week-days', 'day-name-x'])],
      ['wr', 'weekly_right', SPACED],
      ['d', 'daily', OLD(['day-number', 'day-name', 'd-hour-label'])],
      ['m', 'monthly', OLD(['day-name', 'monthly-day-cell-date', 'monthly-day-cell-date-box'])],
      ['x', 'extra', OLD(['day-name'])],
      ['done', 'weekly_left', OLD(['w-day-name'])],
    ];
    for (const [id, type, content] of rows) {
      await db.execute(
        `INSERT INTO page_templates (id, planner_id, profile_id, name, template_type, content, updated_at)
         VALUES (?, 'planner-1', ?, ?, ?, ?, '2025-01-01T00:00:00.000Z')`,
        [id, DEFAULT_PROFILE_ID, id, type, content],
      );
    }

    expect(await runMigrations(db, MIGRATIONS.slice(0, 2))).toEqual([2]);

    const after = await db.select<{ id: string; content: string; version: number; updated_at: string }>(
      'SELECT id, content, version, updated_at FROM page_templates',
    );
    const byId = Object.fromEntries(after.map(r => [r.id, r]));
    expect(byId.wl.content).toBe(OLD(['w-day-number', 'w-day-name', 'week-days', 'day-name-x']));
    expect(byId.wr.content).toBe('{"structure": [{"class": "w-day-name"}, {"class": "w-day-number"}]}');
    expect(byId.d.content).toBe(OLD(['d-day-number', 'd-day-name', 'd-hour-label']));
    expect(byId.m.content).toBe(OLD(['m-day-name', 'm-day-number', 'monthly-day-cell-date-box']));
    expect(byId.x.content).toBe(OLD(['day-name']));
    expect(byId.done.content).toBe(OLD(['w-day-name']));

    for (const id of ['wl', 'wr', 'd', 'm']) {
      expect(byId[id].version).toBe(2);
      expect(byId[id].updated_at).not.toBe('2025-01-01T00:00:00.000Z');
    }
    for (const id of ['x', 'done']) {
      expect(byId[id].version).toBe(1);
      expect(byId[id].updated_at).toBe('2025-01-01T00:00:00.000Z');
    }
    await db.close();
  });
});

describe('migration 0003: rename calendar button', () => {
  it('renames wr-calendar-button in saved templates only where it appears', async () => {
    const db = await createSqlJsDatabase();
    await runMigrations(db, MIGRATIONS.slice(0, 2));
    await seedPlanner(db);
    const old = JSON.stringify({ structure: [{ class: 'wr-calendar-button' }, { class: 'wr-cal-left' }] });
    const rows: Array<[string, string]> = [
      ['old', old],
      ['spaced', '{"structure": [{"class": "wr-calendar-button"}]}'],
      ['other', JSON.stringify({ structure: [{ class: 'wr-calendar-button-x' }] })],
    ];
    for (const [id, content] of rows) {
      await db.execute(
        `INSERT INTO page_templates (id, planner_id, profile_id, name, template_type, content)
         VALUES (?, 'planner-1', ?, ?, 'weekly_right', ?)`,
        [id, DEFAULT_PROFILE_ID, id, content],
      );
    }

    expect(await runMigrations(db)).toEqual([3]);

    const after = await db.select<{ id: string; content: string; version: number }>(
      'SELECT id, content, version FROM page_templates ORDER BY id',
    );
    expect(after).toEqual([
      { id: 'old', content: JSON.stringify({ structure: [{ class: 'w-calendar-button' }, { class: 'wr-cal-left' }] }), version: 2 },
      { id: 'other', content: rows[2][1], version: 1 },
      { id: 'spaced', content: '{"structure": [{"class": "w-calendar-button"}]}', version: 2 },
    ]);
    await db.close();
  });
});
