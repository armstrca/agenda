/**
 * Test support: a fresh in-memory sql.js database with every migration applied, so the schema
 * under test is always the real one. Every storage test in the codebase starts from this.
 *
 * A database per test is cheap (the wasm module is loaded once per worker and shared), so prefer
 * that over sharing one across tests, and `close()` it in `afterEach` to release wasm memory.
 */

import { createSqlJsDatabase, type SqlJsDatabase } from './adapters/sqljs.ts';
import { runMigrations } from './migrate.ts';

export async function createTestDb(): Promise<SqlJsDatabase> {
  const db = await createSqlJsDatabase();
  await runMigrations(db);
  return db;
}
