use tauri::generate_context;
use tauri::Manager; // Import Manager trait for .manage()
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;

// Define a struct to hold the persistent child process
struct BackendProcess {
    tx: Mutex<tauri_plugin_shell::process::CommandChild>,
    rx: Mutex<tokio::sync::mpsc::Receiver<CommandEvent>>,
}

// In setup, spawn the process and manage it in app state
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![ipc_command])
        .setup(|app| {
            let cmd = app.shell().sidecar("agenda_go_backend")
                .expect("failed to create sidecar command")
                .args(["-ipc", "--log-level=debug"]);
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
    child.write((command + "\n").as_bytes()).map_err(|e| e.to_string())?;

    let mut rx = state.rx.lock().await;
    let mut buffer = String::new();

    while let Some(event) = rx.recv().await {
        if let CommandEvent::Stdout(data) = event {
            if let Ok(output) = String::from_utf8(data) {
                buffer.push_str(&output);

                // Try to extract a complete JSON object
                // Find the first '{' and the matching '}'
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
}
