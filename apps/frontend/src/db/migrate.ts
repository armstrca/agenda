/**
 * Migration runner for the sql.js adapter. (The Tauri adapter's migrations run on the Rust side
 * through the plugin, see adapters/tauriSql.ts.)
 *
 * Each pending migration is applied as one script: BEGIN, the file, the bookkeeping INSERT,
 * COMMIT. That keeps a migration all-or-nothing on sql.js, which otherwise autocommits every
 * statement; on failure the runner rolls back and rethrows, so a broken migration leaves neither
 * half a schema nor a misleading schema_migrations row behind. The bookkeeping values are inlined
 * into the script because the target only exposes `select` and `executeScript`.
 *
 * A migration file does not have to end with a semicolon: a lone `;` (an empty statement SQLite
 * accepts) separates it from the INSERT either way.
 */

import type { Database } from './Database.ts';
import { MIGRATIONS, type Migration } from './migrations/index.ts';

export type MigrationTarget = Pick<Database, 'select'> & {
  executeScript(sql: string): Promise<void>;
};

const CREATE_SCHEMA_MIGRATIONS = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  applied_at TEXT NOT NULL
);`;

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function validate(migrations: ReadonlyArray<Migration>): void {
  const seen = new Set<number>();
  for (const m of migrations) {
    if (!Number.isSafeInteger(m.version) || m.version < 1) {
      throw new Error(`invalid migration version: ${String(m.version)}`);
    }
    if (seen.has(m.version)) throw new Error(`duplicate migration version: ${m.version}`);
    seen.add(m.version);
    if (typeof m.name !== 'string' || m.name.length === 0) {
      throw new Error(`migration ${m.version} has no name`);
    }
    if (typeof m.sql !== 'string' || m.sql.trim().length === 0) {
      throw new Error(`migration ${m.version} (${m.name}) has no SQL`);
    }
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Apply every migration whose version is not yet recorded, ascending. Returns the versions
 * applied by this call, so a second call on the same database returns [].
 */
export async function runMigrations(
  db: MigrationTarget,
  migrations: ReadonlyArray<Migration> = MIGRATIONS,
): Promise<number[]> {
  validate(migrations);
  await db.executeScript(CREATE_SCHEMA_MIGRATIONS);

  const rows = await db.select<{ version: number }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map(r => Number(r.version)));
  const pending = migrations
    .filter(m => !applied.has(m.version))
    .sort((a, b) => a.version - b.version);

  const done: number[] = [];
  for (const m of pending) {
    const record =
      `INSERT INTO schema_migrations (version, name, applied_at) VALUES ` +
      `(${m.version}, ${sqlString(m.name)}, ${sqlString(new Date().toISOString())});`;
    const script = ['BEGIN;', m.sql, ';', record, 'COMMIT;'].join('\n');
    try {
      await db.executeScript(script);
    } catch (e) {
      try {
        await db.executeScript('ROLLBACK;');
      } catch {
        // No transaction was open: BEGIN itself failed, so there is nothing to undo.
      }
      throw new Error(`migration ${m.version} (${m.name}) failed: ${errorMessage(e)}`, { cause: e });
    }
    done.push(m.version);
  }
  return done;
}
