#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use sea_orm::Database;
use std::sync::Arc;
use tokio::sync::OnceCell;
use migration::{Migrator, MigratorTrait};
use tauri::Manager;

static DB: OnceCell<Arc<sea_orm::DatabaseConnection>> = OnceCell::const_new();

#[tauri::command]
async fn ipc_command(command: String) -> Result<String, String> {
    let db = DB
        .get()
        .ok_or_else(|| "DB not initialized".to_string())?
        .clone();

    let resp = agenda_rust::ipc::handle_command_json(&db, &command).await;
    serde_json::to_string(&resp).map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![ipc_command])
        .setup(|app| {
            // Init DB once
            tauri::async_runtime::block_on(async {
                // 1) Build DB URL: env wins; otherwise use App Local Data dir and create file if missing.
                let url = if let Ok(u) = std::env::var("AGENDA_RUST_DB_URL") {
                    // Accept either a full sqlite DSN or a raw filesystem path.
                    if u.starts_with("sqlite:") {
                        u
                    } else {
                        let p = std::path::PathBuf::from(u);
                        let path_str = p.to_string_lossy().replace('\\', "/");
                        format!("sqlite://{}?mode=rwc", path_str)
                    }
                } else {
                    // Resolve app-local data dir, fallback to current_dir if unavailable
                    let data_dir = app
                        .handle()
                        .path()
                        .app_local_data_dir()
                        .ok()
                        .unwrap_or_else(|| std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")));
                    let _ = std::fs::create_dir_all(&data_dir);
                    let db_path = data_dir.join("agenda.sqlite");
                    // Normalize Windows path separators for SQLite URL
                    let path_str = db_path.to_string_lossy().replace('\\', "/");
                    format!("sqlite://{}?mode=rwc", path_str)
                };

                eprintln!("[tauri] Using database URL: {}", url);

                // 2) Connect
                let conn = Database::connect(&url)
                    .await
                    .expect("failed to connect DB");

                // 3) Run migrations to ensure schema exists
                if let Err(e) = Migrator::up(&conn, None).await {
                    // Log and proceed; the app may still start but features depending on DB will fail
                    eprintln!("[tauri] migration error: {}", e);
                }

                DB.set(Arc::new(conn)).ok();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
