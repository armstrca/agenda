/**
 * sql.js adapter: SQLite compiled to wasm, used by `vite dev` in the browser and by vitest.
 *
 * What is not obvious from the code:
 *   - sql.js memoises its module-level `initSqlJs()` promise. The first call's config is the only
 *     one that ever applies, and a failed first load (wasm not found) can never be retried with a
 *     different `locateFile`, so "try the default lookup, then fall back" is not an option. The
 *     decision is made up front instead: outside a browser the wasm is resolved through Node's
 *     module resolver (`createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm')`),
 *     which works whether or not the sql.js glue was loaded with a usable `__dirname`. Callers
 *     that know the URL (Vite's `?url` import in db/index.ts) pass `locateFile` themselves.
 *     `sql-wasm.wasm` and the browser build's `sql-wasm-browser.wasm` are byte-identical, so one
 *     file serves both builds whatever name sql.js asks for.
 *   - `db.export()` closes and reopens the connection. Pragmas are per connection, so
 *     `exportBytes()` re-applies `PRAGMA foreign_keys = ON` afterwards; without that the browser
 *     database would silently stop enforcing references after its first persist. The reopen also
 *     discards an uncommitted transaction, so never hold one open across an `await`.
 *   - `rowsAffected` is `sqlite3_changes()`: the count of the last INSERT, UPDATE or DELETE. After
 *     any other statement it is stale, which is harmless because repositories only run DML
 *     through `execute` (migrations go through `executeScript`).
 *   - `onChange` fires synchronously after every `execute` and `executeScript`; debouncing is the
 *     caller's job. A script that fails half way may still have applied its earlier statements
 *     (SQLite autocommits outside an explicit transaction), so it fires on failure too. A failed
 *     single statement changes nothing, so `execute` only fires on success.
 */

import initSqlJs from 'sql.js';

import type { Database, ExecuteResult, SqlParam } from '../Database.ts';

type RawDatabase = initSqlJs.Database;
type LocateFile = (file: string) => string;

export interface SqlJsDatabase extends Database {
  /** Run several `;`-separated statements at once (migrations). No parameters, no result. */
  executeScript(sql: string): Promise<void>;
  /** The whole database as an SQLite file image, for IndexedDB persistence or a new instance. */
  exportBytes(): Uint8Array;
}

export interface SqlJsDatabaseOptions {
  /** Maps the file name sql.js asks for (the wasm) to a URL or path it can load. */
  locateFile?: LocateFile;
  /** An SQLite file image to open instead of an empty database. */
  initialData?: Uint8Array | null;
  /** Called synchronously after every write. Debounce it before persisting. */
  onChange?: () => void;
}

const WASM_SPECIFIER = 'sql.js/dist/sql-wasm.wasm';

/**
 * Outside a browser, resolve the wasm through Node's module resolver. `node:module` is loaded
 * dynamically, with the specifier kept out of the import literal, so a browser bundle neither
 * contains nor tries to resolve it.
 */
async function nodeLocateFile(): Promise<LocateFile | undefined> {
  if (typeof window !== 'undefined') return undefined;
  if (typeof process === 'undefined' || !process.versions?.node) return undefined;
  const specifier = 'node:module';
  const { createRequire } = (await import(/* @vite-ignore */ specifier)) as typeof import('node:module');
  const wasmPath = createRequire(import.meta.url).resolve(WASM_SPECIFIER);
  return file => (file.endsWith('.wasm') ? wasmPath : file);
}

function enableForeignKeys(raw: RawDatabase): void {
  raw.run('PRAGMA foreign_keys = ON');
}

export async function createSqlJsDatabase(options: SqlJsDatabaseOptions = {}): Promise<SqlJsDatabase> {
  const locateFile = options.locateFile ?? (await nodeLocateFile());
  const SQL = await initSqlJs(locateFile ? { locateFile } : {});
  const raw = new SQL.Database(options.initialData ?? null);
  enableForeignKeys(raw);

  const onChange = options.onChange ?? (() => undefined);
  let closed = false;
  const live = (): RawDatabase => {
    if (closed) throw new Error('database is closed');
    return raw;
  };

  return {
    async select<T extends Record<string, unknown> = Record<string, unknown>>(
      sql: string,
      params: SqlParam[] = [],
    ): Promise<T[]> {
      const stmt = live().prepare(sql);
      try {
        stmt.bind(params);
        const rows: T[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject() as T);
        return rows;
      } finally {
        stmt.free();
      }
    },

    async execute(sql: string, params: SqlParam[] = []): Promise<ExecuteResult> {
      // Same prepare/bind/step/free shape as select(): sql.js's db.run() binds before it registers
      // the statement for cleanup, so a bind failure (wrong param count) would leak the statement.
      const db = live();
      const stmt = db.prepare(sql);
      try {
        stmt.bind(params);
        stmt.step();
      } finally {
        stmt.free();
      }
      const rowsAffected = db.getRowsModified();
      onChange();
      return { rowsAffected };
    },

    async executeScript(sql: string): Promise<void> {
      const db = live();
      try {
        db.exec(sql);
      } finally {
        onChange();
      }
    },

    exportBytes(): Uint8Array {
      const db = live();
      const bytes = db.export();
      enableForeignKeys(db);
      return bytes;
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      raw.close();
    },
  };
}
