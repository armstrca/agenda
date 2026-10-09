/**
 * Tauri adapter: SQLite through @tauri-apps/plugin-sql inside the desktop app.
 *
 * Thin by design. Migrations do not run here: the Rust shell registers the same
 * `migrations/*.sql` files through the plugin's `add_migrations`, and the plugin applies them when
 * `Database.load` opens the file. sqlx enables `PRAGMA foreign_keys` by default on every SQLite
 * connection it opens, so nothing has to be done per connection here either.
 *
 * Placeholders: the plugin's docs show `$1, $2` for SQLite, but the SQL reaches SQLite unchanged
 * and values are bound by position, so the `?` placeholders the repositories use work as well.
 *
 * Not unit-tested: the plugin only works inside a Tauri webview.
 */

import TauriSqlDatabase from '@tauri-apps/plugin-sql';

import type { Database, ExecuteResult, SqlParam } from '../Database.ts';

/** Relative to the app's config directory, where the plugin keeps its files. */
export const DEFAULT_TAURI_DB_PATH = 'sqlite:agenda.db';

export async function createTauriDatabase(path = DEFAULT_TAURI_DB_PATH): Promise<Database> {
  const db = await TauriSqlDatabase.load(path);
  let closed = false;
  const live = (): TauriSqlDatabase => {
    if (closed) throw new Error('database is closed');
    return db;
  };

  return {
    async select<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params: SqlParam[] = [],
    ): Promise<T[]> {
      return live().select<T[]>(sql, params);
    },

    async execute(sql: string, params: SqlParam[] = []): Promise<ExecuteResult> {
      const { rowsAffected } = await live().execute(sql, params);
      return { rowsAffected };
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      // Closes only this connection pool; other databases the plugin manages stay open.
      await db.close(path);
    },
  };
}
