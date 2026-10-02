//! Crest (codename Nabito) — desktop shell.
//!
//! The Rust side stays intentionally small: window creation, window geometry
//! persistence, a tiny app-info command the UI can read, and — in release
//! builds — owning the lifetime of the local media helper (Node + yt-dlp
//! sidecars) that powers the YouTube Music source. Playback, the local
//! database, tray, media-key integration and Discord RPC arrive in later
//! phases and will live in their own modules so this file stays a composition
//! root rather than a place where features accumulate.

use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{Manager, RunEvent};
use tauri_plugin_window_state::StateFlags;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    codename: &'static str,
    version: &'static str,
    platform: &'static str,
}

/// Static build metadata for the UI (About page, diagnostics).
#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        name: "Crest",
        codename: "Nabito",
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}

/// The bundled media helper process, when this build owns one.
struct MediaHelper(Mutex<Option<Child>>);

/// Starts the bundled helper: `node.exe mediaHelper.bundle.mjs`, with
/// `YTDLP_PATH` pointing at the bundled `yt-dlp.exe`.
///
/// Layout (set up by `src-tauri/tauri.bundle.conf.json`): the two sidecars are
/// installed next to the app executable, the bundled helper script is a
/// resource under `helper/`.
fn spawn_media_helper(app: &tauri::AppHandle) -> Result<Child, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "cannot locate the app directory".to_string())?;
    let node = exe_dir.join("node.exe");
    let ytdlp = exe_dir.join("yt-dlp.exe");
    let script = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("helper")
        .join("mediaHelper.bundle.mjs");

    for required in [&node, &ytdlp, &script] {
        if !required.exists() {
            return Err(format!("missing media helper file: {}", required.display()));
        }
    }

    let mut command = Command::new(&node);
    command
        .arg(&script)
        .env("YTDLP_PATH", &ytdlp)
        .env("MEDIA_HELPER_PORT", "5267")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // CREATE_NO_WINDOW — no console flash for the helper.
    #[cfg(windows)]
    command.creation_flags(0x0800_0000);

    command.spawn().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    StateFlags::SIZE
                        | StateFlags::POSITION
                        | StateFlags::MAXIMIZED
                        | StateFlags::FULLSCREEN,
                )
                .build(),
        )
        .invoke_handler(tauri::generate_handler![app_info])
        .setup(|app| {
            app.manage(MediaHelper(Mutex::new(None)));

            // Dev (`tauri dev`) already gets its helper from the Vite plugin;
            // only packaged builds spawn their own.
            if !cfg!(debug_assertions) {
                match spawn_media_helper(app.handle()) {
                    Ok(child) => {
                        let state = app.state::<MediaHelper>();
                        if let Ok(mut slot) = state.0.lock() {
                            *slot = Some(child);
                        };
                    }
                    Err(message) => eprintln!("[crest] media helper not started: {message}"),
                }
            }

            // The window starts hidden (see tauri.conf.json) so the user never
            // sees an empty frame before React paints. The frontend reveals it
            // as soon as the first frame is up; this fallback guarantees the
            // window becomes visible even if the webview fails to boot.
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(4000));
                    if !window.is_visible().unwrap_or(true) {
                        let _ = window.show();
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Crest");

    app.run(|handle, event| {
        // Take the helper down with the app. (The helper also exits on its own
        // ~15 s after the webview stops heartbeating, which covers a crash.)
        if let RunEvent::Exit = event {
            if let Some(state) = handle.try_state::<MediaHelper>() {
                if let Ok(mut slot) = state.0.lock() {
                    if let Some(mut child) = slot.take() {
                        let _ = child.kill();
                    }
                }
            }
        }
    });
}
