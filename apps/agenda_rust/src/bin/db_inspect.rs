use sea_orm::{Database, DatabaseConnection, DbBackend, Statement};
use sea_orm::QueryTrait;
use sea_orm::ConnectionTrait;
use std::env;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let db_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://agenda_rust_development.sqlite?mode=rwc".to_string());

    let db = Database::connect(&db_url).await?;

    println!("== sqlite_master (users, planners, pages, page_templates, tldraw_snapshots) ==");
    dump_master(&db, &["users", "planners", "pages", "page_templates", "tldraw_snapshots"]).await?;

    println!("\n== PRAGMA table_info(pages) ==");
    dump_rows(&db, "PRAGMA table_info(pages)").await?;
    println!("\n== PRAGMA foreign_key_list(pages) ==");
    dump_rows(&db, "PRAGMA foreign_key_list(pages)").await?;

    println!("\n== PRAGMA table_info(page_templates) ==");
    dump_rows(&db, "PRAGMA table_info(page_templates)").await?;
    println!("\n== PRAGMA foreign_key_list(page_templates) ==");
    dump_rows(&db, "PRAGMA foreign_key_list(page_templates)").await?;

    println!("\n== PRAGMA table_info(planners) ==");
    dump_rows(&db, "PRAGMA table_info(planners)").await?;
    println!("\n== PRAGMA foreign_key_list(planners) ==");
    dump_rows(&db, "PRAGMA foreign_key_list(planners)").await?;

    println!("\n== PRAGMA table_info(users) ==");
    dump_rows(&db, "PRAGMA table_info(users)").await?;
    println!("\n== PRAGMA foreign_key_list(users) ==");
    dump_rows(&db, "PRAGMA foreign_key_list(users)").await?;

    println!("\n== PRAGMA table_info(tldraw_snapshots) ==");
    dump_rows(&db, "PRAGMA table_info(tldraw_snapshots)").await?;
    println!("\n== PRAGMA foreign_key_list(tldraw_snapshots) ==");
    dump_rows(&db, "PRAGMA foreign_key_list(tldraw_snapshots)").await?;

    println!("\n== PRAGMA foreign_keys ==");
    dump_rows(&db, "PRAGMA foreign_keys").await?;
    println!("\n== PRAGMA foreign_key_check ==");
    dump_rows(&db, "PRAGMA foreign_key_check").await?;

    Ok(())
}

async fn dump_master(db: &DatabaseConnection, names: &[&str]) -> anyhow::Result<()> {
    let in_list = names
        .iter()
        .map(|n| format!("'{}'", n.replace("'", "''")))
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name IN ({}) ORDER BY type, name",
        in_list
    );
    dump_rows(db, &sql).await
}

async fn dump_rows(db: &DatabaseConnection, sql: &str) -> anyhow::Result<()> {
    let rows = db
        .query_all(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
        .await?;
    if rows.is_empty() {
        println!("<no rows>");
        return Ok(());
    }
    // Print generically by column index
    for (i, row) in rows.iter().enumerate() {
        let mut cols = Vec::new();
        let mut idx = 0;
        loop {
            match row.try_get_by_index::<String>(idx) {
                Ok(v) => cols.push(v),
                Err(_) => break,
            }
            idx += 1;
        }
        println!("row {}: {}", i, cols.join(" | "));
    }
    Ok(())
}
