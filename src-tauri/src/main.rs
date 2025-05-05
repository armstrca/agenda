#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, Builder};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

fn main() {
    Builder::default()
        .plugin(tauri_plugin_shell::init())
    .setup(|app| {
     // Spawn sidecar "artichoke" via the AppHandle's shell()
     let child = app
       .shell() 
       .sidecar("artichoke")? 
      .spawn()?; 
            println!("Artichoke sidecar PID: {}", child.1.pid());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![run_ruby_script])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[command]
fn run_ruby_script(app: tauri::AppHandle, script: &str) -> Result<String, String> {
  // spawn sidecar, getting an event receiver
  let (mut rx, mut child) = app
    .shell()
    .sidecar("artichoke")
    .expect("failed to create sidecar")
    .spawn()
    .expect("failed to spawn sidecar");

  // write script to stdin
  child.write(script.as_bytes()).map_err(|e| e.to_string())?;

  // read stdout events
  let mut output = String::new();
  while let Ok(event) = rx.try_recv() {
    if let CommandEvent::Stdout(line) = event {
      output.push_str(std::str::from_utf8(&line).map_err(|e| e.to_string())?);
    }
  }
  Ok(output)
}