# Plan: move the Rust backend into TypeScript behind a thin Tauri shell

Status: implemented on branch ts-migration, 2026-10-09. Phases 0 to 5 are done and verified (unit and fixture
parity tests, browser smoke test on sql.js, desktop shell creating and migrating its database, legacy data
imported). Phase 6 is pending: apps/agenda_rust is still in the tree and should be deleted or its Loco pieces
parked under apps/server once the new shell has been used for a while. ARCHITECTURE.md describes the result.

## 1. Goal and end state

Today the desktop app is React in a Tauri webview talking over a JSON-string IPC to an in-process
Rust library (`apps/agenda_rust`) that owns the SQLite schema, the page find-or-build logic, and
the calendar helpers. That library is built on the Loco web framework, most of which the desktop
build never calls.

End state:

- **One domain layer, in TypeScript**, inside `apps/frontend/src`. It owns the schema, the
  repositories, find-or-build pages, week and month math, holidays and moon phases.
- **A storage interface with two adapters.** SQLite through the official Tauri SQL plugin inside
  the desktop app; sql.js in the browser for `vite dev` and for tests. Same SQL, same migrations.
- **A Tauri shell that is only a shell.** Window, CSP, the SQL plugin with the migration list, and
  nothing else. Roughly sixty lines of Rust. Rust stays available for genuinely hot paths later
  (handwriting recognition, exports) as ordinary typed commands.
- **The Loco crate is parked, not deleted.** Its auth, mailers and workers are the right shape for
  the eventual sync and template-sharing server, so it moves to `apps/server` untouched and out of
  the build.
- The app runs in a plain browser during development, with no Tauri process.

What is explicitly *not* ported: HTTP controllers, JWT auth, password hashing, email verification,
magic links, mailers, background workers, the stdin IPC binary, the dev utilities, Postgres support.

## 2. Target layout

```
apps/
├── frontend/
│   └── src/
│       ├── db/
│       │   ├── migrations/
│       │   │   └── 0001_init.sql          single source of truth; Rust include_str!()s it too
│       │   ├── Database.ts                the interface (select / execute)
│       │   ├── adapters/
│       │   │   ├── tauriSql.ts            @tauri-apps/plugin-sql
│       │   │   └── sqljs.ts               sql.js + IndexedDB persistence (dev, tests)
│       │   ├── migrate.ts                 TS migration runner (used only by the sql.js adapter)
│       │   └── index.ts                   getDb(): picks the adapter via isTauri()
│       ├── domain/
│       │   ├── ids.ts                     uuid v4
│       │   ├── dates.ts                   YYYY-MM-DD helpers; the only place that touches Date
│       │   ├── calendar/
│       │   │   ├── weeks.ts               week ids, normalisation, start/end, prev/next
│       │   │   ├── months.ts              month ids, ranges
│       │   │   ├── grids.ts               42-cell mini calendars, daysOrder
│       │   │   ├── holidays.ts            date-holidays
│       │   │   └── moon.ts                suncalc
│       │   ├── profiles.ts                replaces users
│       │   ├── planners.ts
│       │   ├── templates.ts               + bundled default templates
│       │   ├── pages.ts                   find-or-build weekly / monthly
│       │   ├── entries.ts                 planner_entries upsert / list
│       │   ├── snapshots.ts               tldraw snapshot upsert / list
│       │   └── legacyImport.ts            one-off import from the old agenda_rust SQLite file
│       ├── templates/defaults/            weekly_left.json, weekly_right.json, monthly.json
│       └── routes/ ...                    loaders call domain functions directly
├── desktop/
│   └── src-tauri/                         new minimal shell (section 7)
├── server/                                parked Loco crate (HTTP, auth, mailers), not in any build
└── agenda_rust/                           deleted at the end of phase 6
```

Tests live in `apps/frontend/src/**/*.test.ts` and run with vitest against the sql.js adapter.

## 3. Storage layer

### 3.1 Interface

```ts
export interface Database {
  select<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>;
}
```

That is the whole contract. Repositories write SQL by hand against it. The row counts in a
planner are small and the queries are all by indexed id, so a query builder buys nothing yet.
If one is wanted later, Kysely accepts a custom dialect in about fifty lines over this interface.

Rules the repositories follow:

- Every write is a **single statement**. The Tauri SQL plugin runs on a connection pool and has no
  transaction API spanning calls, so multi-statement atomicity is not available. The schema below
  carries the UNIQUE constraints that make every current upsert expressible as one
  `INSERT ... ON CONFLICT ... DO UPDATE`.
- JSON columns are TEXT. Repositories parse on read and stringify on write; components never see
  strings.
- Dates are `YYYY-MM-DD` strings in and out. Nothing outside `domain/dates.ts` calls `new Date` on
  a string, because `new Date('2025-10-06')` is UTC midnight and shifts a day in US timezones.

### 3.2 Adapters

**Tauri.** `@tauri-apps/plugin-sql` with `Database.load('sqlite:agenda.db')`. The plugin stores
the file in the app config directory and runs the migrations registered on the Rust side at load.
`select` and `execute` map one to one.

**sql.js.** Loads the wasm (`sql.js/dist/sql-wasm.wasm?url` under Vite, a filesystem path under
vitest), opens an in-memory database, runs `migrate.ts`, and after each `execute` schedules a
debounced `db.export()` into IndexedDB so a browser reload keeps data. Dev-only durability is
acceptable; the desktop app never uses this adapter.

**Selection.** `isTauri()` from `@tauri-apps/api/core`. Today nothing in the frontend works outside
Tauri because `invoke` is called unguarded; after this change `yarn dev` in `apps/frontend` renders
real pages.

### 3.3 Migrations

SQL files in `src/db/migrations/`, numbered. The Rust shell embeds them with `include_str!` into
the plugin's migration list; the sql.js runner imports them with `?raw` and tracks applied versions
in a `schema_migrations` table. One source, two runners, no drift.

## 4. Schema v1

This is a fresh schema, not an evolution of the Loco one. The app has not shipped, and the only
data worth keeping is dev data, which section 4.3 imports. Changes from today's tables, with the
reason for each:

| Change | Why |
|---|---|
| `users` becomes `profiles` (id, name, settings) | Local profiles need no password, tokens or email verification. Accounts for sync live on the server later. |
| `deleted_at` on every user-data table | Sync cannot replicate a delete it cannot see. Repositories filter `deleted_at IS NULL`. |
| `version INTEGER NOT NULL DEFAULT 1` on every user-data table, bumped on update | Per-row change tracking for sync. Replaces the nullable `updated_version`. |
| `UNIQUE(planner_id, page_type, period_identifier)` on pages | Makes find-or-build a race-free `INSERT OR IGNORE` + select. |
| `UNIQUE(page_id, tiptap_id)` on planner_entries, `tiptap_id NOT NULL` | Makes the entry save a single upsert. Today a NULL tiptap_id would defeat the key. |
| `UNIQUE(page_id)` on tldraw_snapshots | One drawing layer per page. Today's key (page, planner, user) is the same thing with redundant columns. |
| `planner_entries.content` holds TipTap JSON, not an HTML string | Canonical editor format, round-trips without loss, queryable. |
| `tldraw_snapshots.document` holds only the `document` half of `getSnapshot()` | Camera and selection do not belong in persistent data. |
| `events` gains `external_id`, `calendar_id` | For the planned external calendar sync. No code yet, same as today. |
| `page_templates.schema_version INTEGER` | Lets the template format evolve once templates are shared. |

### 4.1 Tables

```sql
CREATE TABLE profiles (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1);

CREATE TABLE planners (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id),
  name TEXT NOT NULL, description TEXT, planner_settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1);

CREATE TABLE page_templates (
  id TEXT PRIMARY KEY, planner_id TEXT NOT NULL REFERENCES planners(id), profile_id TEXT NOT NULL,
  name TEXT NOT NULL, template_type TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1);
CREATE INDEX idx_templates_default ON page_templates(planner_id, template_type, is_default);

CREATE TABLE pages (
  id TEXT PRIMARY KEY, planner_id TEXT NOT NULL REFERENCES planners(id), profile_id TEXT NOT NULL,
  page_template_id TEXT NOT NULL REFERENCES page_templates(id),
  page_type TEXT NOT NULL, period_identifier TEXT NOT NULL, page_date TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(planner_id, page_type, period_identifier));

CREATE TABLE planner_entries (
  id TEXT PRIMARY KEY, page_id TEXT NOT NULL REFERENCES pages(id), planner_id TEXT NOT NULL, profile_id TEXT NOT NULL,
  tiptap_id TEXT NOT NULL, entry_date TEXT NOT NULL, content TEXT NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(page_id, tiptap_id));
CREATE INDEX idx_entries_page_date ON planner_entries(page_id, entry_date);

CREATE TABLE tldraw_snapshots (
  id TEXT PRIMARY KEY, page_id TEXT NOT NULL UNIQUE REFERENCES pages(id), planner_id TEXT NOT NULL, profile_id TEXT NOT NULL,
  document TEXT NOT NULL, schema TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1);

CREATE TABLE events ( ... today's columns ..., external_id TEXT, calendar_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, version INTEGER NOT NULL DEFAULT 1);
```

A `change_log` table for sync is deliberately **not** in v1. Adding it is a later migration; the
`version` and `deleted_at` columns are what make that migration cheap.

### 4.2 Default templates

Find-or-build fails today with "Default template not found" on a fresh database, because templates
only exist in your dev SQLite. Ship the three current templates as JSON under
`src/templates/defaults/` (the `example scraps/current_*_json.json` files are the source) and have
`planners.create` insert them as `is_default` rows for every new planner. A fresh install then
works with no import step.

### 4.3 Legacy import

`domain/legacyImport.ts` opens the old `agenda_rust_development.sqlite` with sql.js, maps
`users` to one profile, copies planners, templates, pages, snapshots, and converts entry HTML to
TipTap JSON with `generateJSON` from `@tiptap/html`. Exposed as a dev-only button or a vitest-run
script. Delete it after the import.

## 5. Rust to TypeScript mapping

| Rust | Becomes | Notes |
|---|---|---|
| `migration/src/*` | `db/migrations/0001_init.sql` | Rewritten, see section 4. |
| `models/_entities/*` | row types in each `domain/*.ts` | Plain interfaces, no ORM. |
| `models/pages.rs` find_or_build_weekly / monthly | `domain/pages.ts` | Same return shape as today's `IndexReply` so components change later, not now. |
| `models/*.rs` before_save validation | `validate*` functions in each domain module | Allow-list for template_type; content must be an object; name non-empty. |
| `tasks/calendar.rs` holidays_between | `domain/calendar/holidays.ts` | `date-holidays`. See decision in section 11. |
| `tasks/calendar.rs` moon_phases | `domain/calendar/moon.ts` | `suncalc` npm; the Rust crate is a port of it, so results match. |
| `ipc.rs` planner_entries_index / create | `domain/entries.ts` | Single-statement upsert on (page_id, tiptap_id). |
| `ipc.rs` get/create_tldraw_snapshot | `domain/snapshots.ts` | Upsert on page_id. |
| `controllers/planners.rs` get/create | `domain/planners.ts` | "Fall back to first user" becomes "fall back to the default profile". |
| `controllers/page_templates.rs` + `services/api.ts` | `domain/templates.ts` | Gives the template editor a save path that works offline. |
| `models/users.rs` create_with_password | `domain/profiles.ts` | Name only. |
| `ipc.rs` dispatcher, `bin/ipc.rs`, `utils/ipc.ts`, `api/api.js`, `services/api.js` | deleted | Loaders call domain functions. |
| `controllers/auth.rs`, mailers, workers, `app.rs`, `bin/main.rs`, `bin/tool.rs` | moved to `apps/server`, parked | Not compiled by anything. |
| `src-tauri/*` | `apps/desktop/src-tauri` | Rewritten, see section 7. |
| `bin/db_inspect.rs`, `uuid_fix.rs`, `fk_try_insert.rs`, `src-tauri/binaries/` | deleted | Already obsolete. |
| `tests/*` | vitest parity tests | See section 9. |

## 6. Behaviours to preserve

Pulled from the Rust code, so the port has a checklist rather than a memory.

**Period ids**
- Month id `MM_YYYY`, two-digit month. Accept `M_YYYY` as well and normalise to two digits.
- Week id `W_YYYY_[lr]`, one or two digit week, **not zero-padded** on output.
- `weeksInYear(y)` is the ISO week number of 28 December.
- Week < 1 rolls to the last week of the previous year. Week > weeksInYear rolls to week 1 of the
  next year. The page is stored under the normalised id.

**Week range**
- Start from the ISO Monday of that ISO week, then step **backwards** one day at a time until the
  weekday equals the planner's week-start day. The setting is
  `planner_settings.metadata.default_styles["week-start-day"]`, three-letter English, default
  `Mon`. End is start plus six days.

**Page lookup and creation**
- Find by (planner_id, page_type `weekly` or `monthly`, normalised period id).
- On miss, the planner's `is_default` template of type `weekly_left`, `weekly_right` or `monthly`.
  Error if none.
- `page_date` is the period start.

**Entries and snapshots in the response**
- Entries for the page with `entry_date` in [start, end], grouped into
  `{ "YYYY-MM-DD": [{id, content, entry_date, updated_at}] }`.
- Snapshots for the page as `[{id, document_data, schema, updated_at}]`; the component reads
  index 0.

**Holidays**
- Map of `YYYY-MM-DD` to a de-duplicated list of names.
- Countries from `planner_settings.holiday_countries`, upper-cased, unknown codes ignored,
  default `["US"]`.

**Moon phases**
- Evaluate `getMoonIllumination` at 12:00 UTC on each day. Phase thresholds:
  `< 0.03` new, `< 0.20` waxing crescent, `< 0.30` first quarter, `< 0.47` waxing gibbous,
  `< 0.53` full, `< 0.70` waning gibbous, `< 0.85` last quarter, else waning crescent.
- Emoji 🌑🌒🌓🌔🌕🌖🌗🌘 is emitted only on a day whose phase name differs from the previous
  day **within the requested range**; other days get `""`. The first day of any range therefore
  always carries an emoji. Output per day is `{emoji, alt, aria_label}` with `alt` and
  `aria_label` equal to `"Moon phase: <emoji>"` or `""`.

**weekData fields**
- `weekNumber`, `year`, `side`, `mainDates` (7 strings), `endDate`, `holidays`, `moonPhases`,
  `weekStart`, `weeksInYear`.
- `templateData`: first six days as `{entryDate, day_number, day_name (full English),
  holidays[], moon_phase (emoji or ""), month_year ("October 2025")}`. `lastDayData`: the seventh.
- `currentMonthName`: full month name of the **end** date.
- `daysOrder`: seven single letters starting from the week-start day; Thursday is `T`, Sunday `S`.
- `leftCalendar`: the month containing the end date. `rightCalendar`: the month after it. Each is
  `{month: "October 2025", buttonData: {"1".."42": dayNumber | 0}}` with leading blanks
  `(firstWeekdayMondayIndexed - weekStartMondayIndexed + 7) % 7`.
- `nextWeekId`: left side goes to the same week's right; right side goes to next week's left, or
  `1_{year+1}_l` past the last week. `prevWeekId` mirrors it, landing on the previous year's last
  week when needed.

**Template object**: `{id, name, template_type, is_default, user_id, planner_id, content}`.
Keep `user_id` as the key name for now even though it holds a profile id, so
`processTemplateAssets` and the renderers are untouched in phase 4.

**Writes**
- Planner: name must be non-empty; `planner_settings` is a JSON object.
- Template: `template_type` in `daily, weekly, monthly, custom, weekly_left, weekly_right`;
  content must be an object. The editor's `extra` type is not in the list; decide which side
  changes.
- Every update bumps `updated_at` and `version`.

**Bugs to fix during the port, not reproduce**
- Monthly pages: `pages_index` never emits `month_data`, so holidays and moon phases never
  reach the monthly route. Emit `monthData` and read it in the route.
- `planner_entries_create` silently uses today's date when `entry_date` is missing. Make it
  required.
- `planners.tsx` has its own non-ISO, zero-padded `getCurrentWeekId`. Replace with
  `weeks.idForDate(today)` from the domain.

## 7. The Tauri shell

`apps/desktop/src-tauri/Cargo.toml` dependencies: `tauri`, `tauri-plugin-sql` with the `sqlite`
feature, `tauri-plugin-log` if wanted. No `agenda_rust`, `migration`, `sea-orm`, `tokio` or
`windows`.

```rust
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "init",
        sql: include_str!("../../../frontend/src/db/migrations/0001_init.sql"),
        kind: MigrationKind::Up,
    }];
    tauri::Builder::default()
        .plugin(Builder::default().add_migrations("sqlite:agenda.db", migrations).build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

`capabilities/default.json` permissions: `core:default`, `sql:default`, `sql:allow-load`,
`sql:allow-select`, `sql:allow-execute`.

`tauri.conf.json`: same window settings; `frontendDist` and the before-commands point at
`../../frontend` as they do now; drop `bundle.resources` (no more shipping the dev database);
remove `https://cdn.tldraw.com` and `https://storage.googleapis.com` from the CSP once the
offline-asset work lands.

The database moves from the app-local-data directory to the app-config directory, which is where
the plugin puts it. Both are outside OneDrive.

## 8. Frontend wiring

- Route loaders call `loadWeeklyPage(db, plannerId, weekId)` and `loadMonthlyPage(...)` and return
  the same object they return today. Components do not change in this phase.
- `Tiptap.jsx` and `TiptapMonthly.jsx` call `entries.forTiptap` and `entries.upsert`, saving
  `editor.getJSON()`. The monthly component currently uses `fetch`, so this is also a bug fix.
- `TLDrawComponent.jsx` calls `snapshots.save(pageId, getSnapshot(store).document)`.
- `PageTemplateEditor.tsx` calls `templates.save`, replacing the HTTP `services/api.ts`.
- `planners.create.tsx` and `users.create.tsx` call `planners.create` and `profiles.create`.
- Delete `utils/ipc.ts`, `api/api.js`, `services/api.js`, `services/api.ts`.
- Remove `@tauri-apps/plugin-shell`, `redux`, `react-redux`, `redux-saga`, `signia`,
  `signia-react`, `@easyblocks/*` from `package.json`; none are imported.
- Add `@tauri-apps/plugin-sql`, `sql.js`, `date-fns`, `date-holidays`, `suncalc`, `uuid`,
  `vitest`. Use `uuid` rather than `crypto.randomUUID`, which is unavailable when the dev server is
  opened over a LAN address.

## 9. Testing and parity

Before any Rust is deleted, capture golden output from the current app:

1. Run `cargo run --bin ipc` in `apps/agenda_rust` and feed it `pages_index` commands for a set of
   cases: week 1 and the last week of a year, a 53-week year (2026), week 0 and week 54 (to
   exercise normalisation), a planner with `week-start-day: Sun`, a Sunday-start month, and
   February in a leap year. Save each response under `apps/frontend/src/domain/__fixtures__/`.
2. The vitest parity tests run the TypeScript `loadWeeklyPage` against a sql.js database seeded
   with the same planner and templates, strip ids and timestamps, and deep-compare `weekData`,
   `template`, and the grouped entries against the fixture.

Holiday names will differ between the two libraries, so the holiday comparison asserts the date
keys and list shape, not the strings. Everything else, including every moon emoji and every
`buttonData` cell, should match exactly.

Unit tests beyond parity: week normalisation at both year boundaries, grid offsets for all seven
week-start days, the moon thresholds at their edges, the entry upsert replacing rather than
duplicating, find-or-build creating a page exactly once under concurrent calls.

## 10. Phases and order

Each phase ends in a checkpoint you can see. Estimates are rough and assume focused work.

| Phase | Work | Checkpoint | Est. |
|---|---|---|---|
| 0 | Capture parity fixtures (section 9) from the current Rust build. In parallel and independently: the offline blockers from the architecture review (bundled fonts, `@tldraw/assets`). | Fixture JSON files committed. | half a day |
| 1 | `Database` interface, sql.js adapter, migration runner, `0001_init.sql`, vitest harness. | A test creates the schema and round-trips a row. | 1 day |
| 2 | `domain/calendar/*` and `domain/dates.ts` as pure functions with unit tests. | Week, grid, moon and holiday tests green. | 1 day |
| 3 | Repositories, find-or-build, default template seeding, validation. | Parity tests green against the fixtures. | 1 to 2 days |
| 4 | Frontend wiring (section 8). | `yarn dev` in `apps/frontend` renders weekly and monthly pages in Chrome with no Tauri process; typing and drawing persist across reload. | 1 to 2 days |
| 5 | New `apps/desktop/src-tauri` shell with the SQL plugin; root `yarn dev` and `yarn build` point at it; legacy import of your dev data. | Desktop app runs; database file appears in the app config dir; imported templates render. | half to 1 day |
| 6 | Move Loco bits to `apps/server`, delete `apps/agenda_rust`, delete the old client files, update `ARCHITECTURE.md` and the root `README.md`. | Clean tree, docs match. | half a day |

Total on the order of one to one and a half working weeks. Phases 1 to 3 touch no existing
file, so the current app keeps working until phase 4 begins.

## 11. Decisions to make before phase 2

- **Holiday regions.** The Rust code merges every subdivision of each country, so a US planner
  shows every state's holidays. `date-holidays` works per country with an optional state. The
  recommendation is national holidays by default plus an optional `holiday_regions` setting such
  as `["US-IL"]`. This changes visible output and should be a deliberate choice.
- **Entry content format.** This plan switches to TipTap JSON. If you would rather keep HTML to
  avoid the import conversion, the only change is the import step; everything else is the same.
- **`extra` template type.** The editor offers it, the model rejects it. Pick one.
- **Snapshot payload.** Document only, or document plus session as today. Document only is
  recommended and is what the plan assumes.

## 12. Risks

- **No cross-call transactions in the SQL plugin.** Mitigated by the UNIQUE constraints and
  single-statement upserts. If a true multi-statement transaction is ever needed, it is one small
  typed Rust command, not a redesign.
- **Timezone handling in JavaScript dates.** Mitigated by routing every string-to-date conversion
  through `domain/dates.ts` and testing a US timezone in CI.
- **sql.js wasm loading** differs between Vite and vitest. Known pattern, handled inside the
  adapter, but budget an hour for it.
- **Library drift in holidays** means the holiday fixture comparison is structural, not exact.
  Accepted.
- **Tauri mobile later** uses the same SQL plugin, so nothing here blocks it.
