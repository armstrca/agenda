use sea_orm::Database;
use agenda_rust::ipc::OutgoingResponse;
use std::env;
use tokio::io::{self, AsyncBufReadExt, BufReader};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Resolve DB URL (env override or default to local sqlite file)
    let db_url = env::var("AGENDA_RUST_DB_URL")
        .unwrap_or_else(|_| "sqlite://agenda_rust_development.sqlite".to_string());
    let db = Database::connect(&db_url).await?;

    let stdin = io::stdin();
    let mut lines = BufReader::new(stdin).lines();

    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let resp = agenda_rust::ipc::handle_command_json(&db, &line).await;
        println!("{}", serde_json::to_string(&resp).unwrap_or_else(|e| {
            serde_json::to_string(&OutgoingResponse {
                success: false,
                error: Some(format!("serialization error: {}", e)),
                data: None,
            })
            .unwrap()
        }));
    }

    Ok(())
}

// All handlers moved to agenda_rust::ipc
