//! Agenda desktop shell.
//!
//! This crate is deliberately tiny. All planner logic lives in TypeScript under
//! `apps/frontend/src/domain`; the Rust side only opens a window and provides SQLite through
//! `tauri-plugin-sql`. The schema is owned by the frontend too: the migration SQL below is the
//! very same files the browser build applies with `src/db/migrate.ts`, embedded at compile time so
//! the two can never drift. Cargo tracks `include_str!` inputs, so editing the SQL rebuilds the shell.
//!
//! The database file lives in the app config directory (`%APPDATA%\com.agenda.dev\agenda.db` on
//! Windows), which the plugin resolves from the `sqlite:` URL below. The frontend opens it with the
//! same URL in `src/db/adapters/tauriSql.ts`.

use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

/// Must match the path used by `createTauriDatabase` in the frontend.
pub const DB_URL: &str = "sqlite:agenda.db";

fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "init",
            sql: include_str!("../../../frontend/src/db/migrations/0001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "prefix_day_classes",
            sql: include_str!("../../../frontend/src/db/migrations/0002_prefix_day_classes.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "rename_calendar_button",
            sql: include_str!("../../../frontend/src/db/migrations/0003_rename_calendar_button.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(SqlBuilder::default().add_migrations(DB_URL, migrations()).build())
        .run(tauri::generate_context!())
        .expect("error while running the agenda desktop shell");
}
