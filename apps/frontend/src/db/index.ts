/**
 * The one place that decides which storage adapter the app runs on.
 *
 * Inside the Tauri webview `isTauri()` is true and the desktop SQLite file is used through the
 * plugin, with migrations already applied on the Rust side. Anywhere else (`vite dev` in a plain
 * browser) sql.js runs in memory, seeded from the last image saved in IndexedDB and written back
 * at most once per 500 ms after a change; `pagehide` flushes a pending save so closing the tab
 * right after an edit does not lose it.
 *
 * `getDb()` memoises the opening promise so concurrent callers share one connection. A failed
 * open clears the memo, so the next call retries instead of returning the same rejection forever.
 */

import { isTauri } from '@tauri-apps/api/core';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import type { Database } from './Database.ts';
import { createSqlJsDatabase, type SqlJsDatabase } from './adapters/sqljs.ts';
import { createTauriDatabase } from './adapters/tauriSql.ts';
import { runMigrations } from './migrate.ts';
import { loadFromIndexedDb, saveToIndexedDb } from './persistence/indexedDb.ts';

export type { Database, ExecuteResult, SqlParam } from './Database.ts';

const STORAGE_KEY = 'agenda.sqlite';
const SAVE_DEBOUNCE_MS = 500;

let memo: Promise<Database> | null = null;

async function openBrowserDatabase(): Promise<Database> {
  const initialData = await loadFromIndexedDb(STORAGE_KEY);

  let db: SqlJsDatabase | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty || db === null) return;
    dirty = false;
    void saveToIndexedDb(STORAGE_KEY, db.exportBytes());
  };
  const scheduleSave = (): void => {
    dirty = true;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
  };

  // Saving is armed only once the database is open and migrated. Until then every onChange comes
  // from migration bookkeeping, and persisting at that point would (a) write the full image on every
  // page load and (b) overwrite a stored image with an empty one if the IndexedDB read had failed.
  let armed = false;
  db = await createSqlJsDatabase({
    locateFile: () => sqlWasmUrl,
    initialData,
    onChange: () => {
      if (armed) scheduleSave();
    },
  });
  const applied = await runMigrations(db);
  armed = true;
  if (applied.length > 0) scheduleSave();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
  return db;
}

export async function getDb(): Promise<Database> {
  if (memo === null) {
    const opening = isTauri() ? createTauriDatabase() : openBrowserDatabase();
    memo = opening;
    opening.catch(() => {
      if (memo === opening) memo = null;
    });
  }
  return memo;
}

/** Forget the memoised connection so the next getDb() opens a fresh one. */
export function resetDbForTests(): void {
  memo = null;
}
