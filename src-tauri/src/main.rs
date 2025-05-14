use tauri::api::process::is_env;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let handle = app.handle();

            // Only spawn sidecar in production
            if !is_env("TAURI_DEV") {
                let sidecar_command = handle
                    .shell()
                    .sidecar("agenda_go_backend")
                    .expect("failed to get sidecar command");
                let (mut rx, mut _child) = sidecar_command
                    .spawn()
                    .expect("Failed to spawn sidecar");

                tauri::async_runtime::spawn(async move {
                    while let Some(event) = rx.recv().await {
                        if let CommandEvent::Stdout(line_bytes) = event {
                            let line = String::from_utf8_lossy(&line_bytes);
                            println!("⚙️ Sidecar stdout: {}", line.trim_end());
                        }
                    }
                });
            }

            Ok(())
        })
        .run(generate_context!())
        .expect("error while running tauri application");
}
