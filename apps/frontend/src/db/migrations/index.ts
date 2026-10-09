/**
 * The ordered list of schema migrations, each a plain SQL file in this folder.
 *
 * The same files are embedded by the Rust shell for the Tauri SQL plugin; this list is what the
 * sql.js runner (`../migrate.ts`) applies in the browser and under vitest. Vite's `?raw` import
 * inlines the file content as a string, and vitest shares Vite's pipeline, so it works there too.
 *
 * Versions are the leading number of the file name. They must be unique and only ever grow: an
 * applied migration is never edited, a schema change is a new file appended here.
 */

import init from './0001_init.sql?raw';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly sql: string;
}

export const MIGRATIONS: ReadonlyArray<Migration> = [{ version: 1, name: 'init', sql: init }];
