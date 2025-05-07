use tauri::{CustomMenuItem, Manager, Window};
use tauri::api::process::{Command, CommandEvent};

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      // Spawn the Go sidecar
      let mut child = Command::new_sidecar("agenda-backend-go")?
        .spawn()
        .expect("Failed to launch sidecar");
      // Optionally, listen for its stdout
      app.listen_global("sidecar-stdout", move |_| {
        if let Ok(event) = child.try_recv() {
          if let CommandEvent::Stdout(line) = event {
            println!("Sidecar: {}", line);
          }
        }
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![/* your commands */])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
