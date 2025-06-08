#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::generate_context;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use tokio::time::timeout;
use std::time::Duration;

// Define a struct to hold the persistent child process
struct BackendProcess {
    tx: Mutex<tauri_plugin_shell::process::CommandChild>,
    rx: Mutex<tokio::sync::mpsc::Receiver<CommandEvent>>,
}

// In setup, spawn the process and manage it in app state
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::default().build())
        .invoke_handler(tauri::generate_handler![ipc_command])
        .setup(|app| {
            let mut cmd = app.shell().sidecar("agenda_go_backend")
                .expect("failed to create sidecar command")
                .args(["-ipc", "--unbuffered"]);

            #[cfg(debug_assertions)]
            {
                cmd = cmd.env("AGENDA_ENV", "development");
            }
               
            let (rx, child) = cmd.spawn().expect("failed to spawn sidecar");
            app.manage(BackendProcess {
                tx: Mutex::new(child),
                rx: Mutex::new(rx),
            });
            Ok(())
        })
        .run(generate_context!())
        .expect("error while running tauri application");
}

// Then in ipc_command, use the managed process instead of spawning a new one
#[tauri::command]
async fn ipc_command(
    state: tauri::State<'_, BackendProcess>,
    command: String,
) -> Result<String, String> {
    let mut child = state.tx.lock().await;
    
    // Log the command for debugging
    log::debug!("Sending command to backend: {}", command);
    
    // Write command to backend with a newline
    child.write((command + "\n").as_bytes()).map_err(|e| {
        log::error!("Failed to write to backend: {}", e);
        e.to_string()
    })?;
    
    // Add timeout handling
    match timeout(Duration::from_secs(15), async {
        let mut rx = state.rx.lock().await;
        let mut buffer = String::new();

        while let Some(event) = rx.recv().await {
            if let CommandEvent::Stdout(data) = event {
                if let Ok(output) = String::from_utf8(data) {
                    buffer.push_str(&output);
                    
                    // JSON parsing logic
                    let mut open_braces = 0;
                    let mut start = None;
                    for (i, c) in buffer.char_indices() {
                        if c == '{' {
                            if open_braces == 0 {
                                start = Some(i);
                            }
                            open_braces += 1;
                        } else if c == '}' {
                            open_braces -= 1;
                            if open_braces == 0 {
                                if let Some(s) = start {
                                    let json_str = buffer[s..=i].to_string();
                                    return Ok(json_str);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        Err("No response from backend".to_string())
    }).await {
        Ok(result) => result,
        Err(_) => Err("Backend response timed out".to_string())
    }
}
