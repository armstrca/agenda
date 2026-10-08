use sea_orm::{Database, DatabaseConnection, DbBackend, Statement};
use sea_orm::ConnectionTrait;
use std::env;
use uuid::Uuid;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let db_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://agenda_rust_development.sqlite?mode=rwc".to_string());
    let db = Database::connect(&db_url).await?;
    db.execute(Statement::from_string(DbBackend::Sqlite, "PRAGMA foreign_keys = ON".to_string())).await?;

    // Adjust these UUIDs if needed to match your DB
    let user_id = Uuid::parse_str("1082f72e-65be-4112-8707-c1719dda4bc4")?;
    let planner_id = Uuid::parse_str("38e012ec-0ab2-4fbe-8e68-8a75e4716a35")?;
    let page_template_id = Uuid::parse_str("91256f9b-11c6-4ce7-b1be-971ae696559d")?;

    let sql = "INSERT INTO \"pages\" (\"page_date\", \"page_type\", \"period_identifier\", \"user_id\", \"planner_id\", \"page_template_id\") VALUES (?, ?, ?, ?, ?, ?)";
    let res = db.execute(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        sql,
        vec![
            // Use ISO date string; SQLite will store as text affinity
            "2025-09-29".into(),
            "weekly".into(),
            "40_2025_l".into(),
            user_id.as_bytes().to_vec().into(),
            planner_id.as_bytes().to_vec().into(),
            page_template_id.as_bytes().to_vec().into(),
        ],
    )).await;

    match res {
        Ok(out) => {
            println!("Insert OK, rows_affected={}", out.rows_affected());
        }
        Err(e) => {
            eprintln!("Insert failed: {}", e);
        }
    }

    Ok(())
}
