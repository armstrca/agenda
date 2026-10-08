use sea_orm::{Database, DatabaseConnection, DbBackend, Statement};
use sea_orm::QueryTrait;
use sea_orm::ConnectionTrait;
use std::env;
use uuid::Uuid;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Determine DB URL from env or use the dev default relative to repo root
    let db_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite://agenda_rust_development.sqlite?mode=rwc".to_string());

    let db = Database::connect(&db_url).await?;

    // Disable foreign key checks during conversion to avoid transient mismatches
    exec(&db, "PRAGMA foreign_keys = OFF").await?;
    exec(&db, "PRAGMA journal_mode = WAL").await.ok();

    // Convert UUID columns in topological order (parents first)
    // users
    convert_uuid_col(&db, "users", "id").await?;

    // planners (FK -> users)
    convert_uuid_col(&db, "planners", "id").await?;
    convert_uuid_col(&db, "planners", "user_id").await?;

    // page_templates (FK -> users, planners)
    convert_uuid_col(&db, "page_templates", "id").await?;
    convert_uuid_col(&db, "page_templates", "user_id").await?;
    convert_uuid_col(&db, "page_templates", "planner_id").await?;

    // pages (FK -> users, planners, page_templates)
    convert_uuid_col(&db, "pages", "id").await?;
    convert_uuid_col(&db, "pages", "user_id").await?;
    convert_uuid_col(&db, "pages", "planner_id").await?;
    convert_uuid_col(&db, "pages", "page_template_id").await?;

    // planner_entries (FK -> pages, users, planners)
    convert_uuid_col(&db, "planner_entries", "id").await?;
    convert_uuid_col(&db, "planner_entries", "page_id").await?;
    convert_uuid_col(&db, "planner_entries", "user_id").await?;
    convert_uuid_col(&db, "planner_entries", "planner_id").await?;

    // tldraw_snapshots (FK -> pages, users, planners)
    convert_uuid_col(&db, "tldraw_snapshots", "id").await?;
    convert_uuid_col(&db, "tldraw_snapshots", "page_id").await?;
    convert_uuid_col(&db, "tldraw_snapshots", "user_id").await?;
    convert_uuid_col(&db, "tldraw_snapshots", "planner_id").await?;

    // Ensure parent tables have UNIQUE indexes on their primary key columns
    // SQLite requires the parent key to be PRIMARY KEY or have a UNIQUE index
    ensure_unique_index(&db, "users", "id").await?;
    ensure_unique_index(&db, "planners", "id").await?;
    ensure_unique_index(&db, "page_templates", "id").await?;
    ensure_unique_index(&db, "pages", "id").await?;

    // Re-enable FKs and check integrity
    exec(&db, "PRAGMA foreign_keys = ON").await?;
    let check = query_text(&db, "PRAGMA integrity_check").await?;
    println!("Integrity check: {}", check);

    Ok(())
}

async fn exec(db: &DatabaseConnection, sql: &str) -> anyhow::Result<()> {
    db.execute(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
        .await?;
    Ok(())
}

async fn query_text(db: &DatabaseConnection, sql: &str) -> anyhow::Result<String> {
    let row = db
        .query_one(Statement::from_string(DbBackend::Sqlite, sql.to_string()))
        .await?;
    let v = row
        .and_then(|r| r.try_get_by_index::<String>(0).ok())
        .unwrap_or_else(|| "unknown".to_string());
    Ok(v)
}

async fn ensure_unique_index(db: &DatabaseConnection, table: &str, col: &str) -> anyhow::Result<()> {
    let idx_name = format!("idx_{}_{}_uniq", table, col);
    let sql = format!(
        "CREATE UNIQUE INDEX IF NOT EXISTS {idx} ON {table}({col})",
        idx = idx_name,
        table = table,
        col = col
    );
    exec(db, &sql).await?;
    println!("Ensured UNIQUE index on {table}({col})", table = table, col = col);
    Ok(())
}

async fn convert_uuid_col(db: &DatabaseConnection, table: &str, col: &str) -> anyhow::Result<()> {
    // Select rowid and current value for rows where the column is a TEXT 36-char UUID
    let select_sql = format!(
        "SELECT rowid, {col} FROM {table} WHERE {col} IS NOT NULL AND typeof({col}) <> 'blob'",
        table = table,
        col = col
    );

    let rows = db
        .query_all(Statement::from_string(
            DbBackend::Sqlite,
            select_sql.clone(),
        ))
        .await?;

    if rows.is_empty() {
        println!("{table}.{col}: no rows to convert", table = table, col = col);
        return Ok(());
    }

    let mut converted = 0usize;
    for row in rows {
        let rowid: i64 = row.try_get_by("rowid").unwrap_or_default();
        // Try reading as String first
        let val: Option<String> = row.try_get_by(col).ok();
        if let Some(s) = val {
            // Accept 36-char hyphenated UUIDs or 32-char hex
            let cleaned = s.replace('-', "");
            if cleaned.len() == 32 {
                if let Ok(uuid) = Uuid::parse_str(&s) {
                    let bytes = uuid.as_bytes().to_vec();
                    // Update using rowid to avoid changing PK lookups mid-flight
                    let update_sql = format!("UPDATE {table} SET {col} = ? WHERE rowid = ?", table = table, col = col);
                    db.execute(Statement::from_sql_and_values(
                        DbBackend::Sqlite,
                        &update_sql,
                        vec![bytes.into(), rowid.into()],
                    ))
                    .await?;
                    converted += 1;
                } else {
                    eprintln!(
                        "WARNING: {table}.{col} rowid {rowid}: invalid UUID string '{s}', skipping",
                        table = table,
                        col = col,
                        rowid = rowid,
                        s = s
                    );
                }
            } else {
                eprintln!(
                    "WARNING: {table}.{col} rowid {rowid}: unexpected length {}, skipping",
                    s.len()
                );
            }
        } else {
            // Might already be blob for this row; skip
        }
    }

    println!(
        "{table}.{col}: converted {converted} row(s) to BLOB(16) UUIDs",
        table = table,
        col = col,
        converted = converted
    );

    Ok(())
}
