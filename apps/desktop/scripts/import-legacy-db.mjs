#!/usr/bin/env node
// One-off import of data from the retired Rust backend's SQLite file into the new desktop database.
//
// Usage (from anywhere; needs Node 22+ for node:sqlite):
//   node apps/desktop/scripts/import-legacy-db.mjs [--source <old.sqlite>] [--target <agenda.db>] [--dry-run]
//
// Defaults:
//   --source  %LOCALAPPDATA%\com.agenda.dev\agenda.sqlite   (where the old Tauri app wrote)
//   --target  %APPDATA%\com.agenda.dev\agenda.db           (where tauri-plugin-sql puts the new one)
//
// Launch the new desktop app once before running this, so the plugin has created the target file
// and applied the schema. The script refuses to run against a target without that schema, because
// creating the schema here would leave the plugin's migration bookkeeping out of sync.
//
// What is copied, with conversions:
//   users            → profiles        rows whose id is not text (a leftover of the BLOB-uuid era) are skipped
//   planners         → planners        user_id → profile_id (falls back to the default profile)
//   page_templates   → page_templates  content copied verbatim
//   pages            → pages           duplicates by (planner, type, period) are ignored
//   planner_entries  → planner_entries HTML strings become TipTap JSON; rows without tiptap_id are skipped
//   tldraw_snapshots → tldraw_snapshots only the `document` half of a `{document, session}` snapshot is kept;
//                                        one row per page (latest updated_at wins)
// Re-running is safe: every insert is INSERT OR IGNORE.

import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_PROFILE_ID = '00000000-0000-4000-8000-000000000001';

function parseArgs(argv) {
  const out = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') out.dryRun = true;
    else if (a === '--source') out.source = argv[++i];
    else if (a === '--target') out.target = argv[++i];
    else if (a === '--help' || a === '-h') { console.log('see header comment'); process.exit(0); }
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

const args = parseArgs(process.argv);
const source = args.source ?? join(process.env.LOCALAPPDATA ?? '', 'com.agenda.dev', 'agenda.sqlite');
const target = args.target ?? join(process.env.APPDATA ?? '', 'com.agenda.dev', 'agenda.db');

if (!existsSync(source)) fail(`source database not found: ${source}`);
if (!existsSync(target)) fail(`target database not found: ${target}\nLaunch the desktop app once so it creates the file, then re-run.`);

// Work on a copy of the source so an un-checkpointed WAL is replayed without touching the original.
const scratch = mkdtempSync(join(tmpdir(), 'agenda-import-'));
const sourceCopy = join(scratch, 'source.sqlite');
copyFileSync(source, sourceCopy);
for (const suffix of ['-wal', '-shm']) if (existsSync(source + suffix)) copyFileSync(source + suffix, sourceCopy + suffix);

const src = new DatabaseSync(sourceCopy);
const dst = new DatabaseSync(target);

const hasTable = (db, name) => !!db.prepare(`select 1 from sqlite_master where type = 'table' and name = ?`).get(name);
if (!hasTable(dst, '_sqlx_migrations') || !hasTable(dst, 'profiles')) {
  fail(`target ${target} does not have the app schema yet. Launch the desktop app once, close it, then re-run.`);
}
for (const t of ['users', 'planners', 'page_templates', 'pages', 'planner_entries', 'tldraw_snapshots']) {
  if (!hasTable(src, t)) fail(`source is missing table ${t}; this script understands the agenda_rust schema only`);
}

const all = (db, sql, ...p) => db.prepare(sql).all(...p);
const run = (db, sql, ...p) => db.prepare(sql).run(...p).changes;
const ts = (v) => {
  if (v == null) return new Date().toISOString();
  const s = String(v);
  // "2025-10-22 03:12:45.123456+00:00" → ISO-8601 with a T; anything else passes through.
  return /^\d{4}-\d{2}-\d{2} /.test(s) ? s.replace(' ', 'T') : s;
};
const jsonText = (v, what) => {
  if (v == null) return null;
  const s = typeof v === 'string' ? v : Buffer.isBuffer(v) ? v.toString('utf8') : JSON.stringify(v);
  try { JSON.parse(s); } catch { fail(`${what}: stored JSON does not parse`); }
  return s;
};

const stats = {};
const bump = (k, n = 1) => (stats[k] = (stats[k] ?? 0) + n);

dst.exec('BEGIN');
try {
  // profiles
  const profileIds = new Set(all(dst, 'select id from profiles').map((r) => r.id));
  for (const u of all(src, 'select id, name, created_at, updated_at from users')) {
    if (typeof u.id !== 'string') { bump('users_skipped_blob_id'); continue; }
    const n = run(dst, 'insert or ignore into profiles (id, name, settings, created_at, updated_at) values (?, ?, ?, ?, ?)',
      u.id, u.name ?? 'Imported', '{}', ts(u.created_at), ts(u.updated_at));
    if (n) profileIds.add(u.id);
    bump('profiles', n);
  }
  const profileFor = (userId) => (typeof userId === 'string' && profileIds.has(userId) ? userId : DEFAULT_PROFILE_ID);

  // planners
  for (const p of all(src, 'select id, name, description, planner_settings, user_id, created_at, updated_at from planners')) {
    bump('planners', run(dst,
      'insert or ignore into planners (id, profile_id, name, description, planner_settings, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)',
      p.id, profileFor(p.user_id), p.name, p.description ?? null, jsonText(p.planner_settings, `planner ${p.id}`) ?? '{}', ts(p.created_at), ts(p.updated_at)));
  }

  // templates
  for (const t of all(src, 'select id, name, content, template_type, is_default, user_id, planner_id, created_at, updated_at from page_templates')) {
    bump('page_templates', run(dst,
      'insert or ignore into page_templates (id, planner_id, profile_id, name, template_type, is_default, content, schema_version, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)',
      t.id, t.planner_id, profileFor(t.user_id), t.name, t.template_type, t.is_default ? 1 : 0, jsonText(t.content, `template ${t.id}`), ts(t.created_at), ts(t.updated_at)));
  }

  // pages
  for (const p of all(src, 'select id, page_date, page_type, period_identifier, user_id, planner_id, page_template_id, created_at, updated_at from pages')) {
    bump('pages', run(dst,
      'insert or ignore into pages (id, planner_id, profile_id, page_template_id, page_type, period_identifier, page_date, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      p.id, p.planner_id, profileFor(p.user_id), p.page_template_id, p.page_type, p.period_identifier, String(p.page_date).slice(0, 10), ts(p.created_at), ts(p.updated_at)));
  }

  // entries (HTML → TipTap JSON when needed)
  let toJson = null;
  for (const e of all(src, 'select id, content, tiptap_id, entry_date, user_id, planner_id, page_id, created_at, updated_at from planner_entries')) {
    if (e.tiptap_id == null || e.tiptap_id === '') { bump('entries_skipped_no_tiptap_id'); continue; }
    let content = e.content;
    if (Buffer.isBuffer(content)) content = content.toString('utf8');
    let parsed;
    try { parsed = JSON.parse(content); } catch { parsed = content; }
    if (typeof parsed === 'string') {
      // Legacy rows hold an HTML string inside a JSON string.
      if (!toJson) {
        const [{ generateJSON }, { default: StarterKit }, { default: Link }] = await Promise.all([
          import('@tiptap/html'), import('@tiptap/starter-kit'), import('@tiptap/extension-link'),
        ]);
        toJson = (html) => generateJSON(html, [StarterKit.configure({ link: false }), Link]);
      }
      parsed = toJson(parsed);
      bump('entries_converted_from_html');
    }
    bump('planner_entries', run(dst,
      'insert or ignore into planner_entries (id, page_id, planner_id, profile_id, tiptap_id, entry_date, content, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      e.id, e.page_id, e.planner_id, profileFor(e.user_id), String(e.tiptap_id), String(e.entry_date).slice(0, 10), JSON.stringify(parsed), ts(e.created_at), ts(e.updated_at)));
  }

  // snapshots: newest first so INSERT OR IGNORE keeps the latest per page
  for (const s of all(src, 'select id, document_data, schema, user_id, planner_id, page_id, created_at, updated_at from tldraw_snapshots order by updated_at desc')) {
    const raw = jsonText(s.document_data, `snapshot ${s.id}`);
    const parsed = JSON.parse(raw);
    const document = parsed && typeof parsed === 'object' && 'document' in parsed ? parsed.document : parsed;
    bump('tldraw_snapshots', run(dst,
      'insert or ignore into tldraw_snapshots (id, page_id, planner_id, profile_id, document, schema, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)',
      s.id, s.page_id, s.planner_id, profileFor(s.user_id), JSON.stringify(document), jsonText(s.schema, `snapshot schema ${s.id}`), ts(s.created_at), ts(s.updated_at)));
  }

  if (args.dryRun) {
    dst.exec('ROLLBACK');
    console.log('dry run, nothing written. Would import:', stats);
  } else {
    dst.exec('COMMIT');
    console.log('imported:', stats);
  }
} catch (e) {
  dst.exec('ROLLBACK');
  throw e;
} finally {
  src.close();
  dst.close();
}

function fail(msg) {
  console.error(msg);
  process.exit(1);
}
