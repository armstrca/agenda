#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::generate_context;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

fn main() {
    tauri::Builder::default()
        // initialize the shell plugin
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle();

            // Note: this name MUST match one of the entries in `externalBin`
            let sidecar_command = handle
                .shell()
                .sidecar("agenda_go_backend")
                .expect("failed to get sidecar command");
            let (mut rx, mut _child) = sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");

            // read stdout/stderr asynchronously
            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    if let CommandEvent::Stdout(line_bytes) = event {
                        // convert bytes to string lossily
                        let line = String::from_utf8_lossy(&line_bytes);
                        println!("⚙️ Sidecar stdout: {}", line.trim_end());
                    }
                }
            });

            Ok(())
        })
        .run(generate_context!())
        .expect("error while running tauri application");
}
