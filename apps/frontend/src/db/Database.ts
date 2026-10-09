/**
 * The storage contract every repository is written against.
 *
 * Two adapters implement it:
 *   - adapters/tauriSql.ts  — SQLite through @tauri-apps/plugin-sql inside the desktop app.
 *   - adapters/sqljs.ts     — sql.js (SQLite compiled to wasm) in the browser and under vitest.
 *
 * Rules for callers (repositories):
 *   - Every write is a single statement. There is no transaction API, because the Tauri plugin
 *     runs on a connection pool where consecutive calls may land on different connections.
 *     Use `INSERT ... ON CONFLICT ... DO UPDATE` and `INSERT OR IGNORE` for atomicity.
 *   - Placeholders are positional `?`. Both adapters bind params in order.
 *   - Pass booleans as 0/1 and JSON as a string. Dates as "YYYY-MM-DD", timestamps as ISO-8601 UTC.
 *   - Rows come back with column names as keys; INTEGER columns are numbers, TEXT columns strings,
 *     NULL is null. Nothing is parsed for you.
 */

export type SqlParam = string | number | null;

export interface ExecuteResult {
  rowsAffected: number;
}

export interface Database {
  /** Run a statement that returns rows. */
  select<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: SqlParam[],
  ): Promise<T[]>;

  /** Run a statement that does not return rows. */
  execute(sql: string, params?: SqlParam[]): Promise<ExecuteResult>;

  /** Release the underlying connection. Tests call this; the app never needs to. */
  close(): Promise<void>;
}
