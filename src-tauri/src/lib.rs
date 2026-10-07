//! Crest (codename Nabito) — desktop shell.
//!
//! The Rust side stays intentionally small: window creation, window geometry
//! persistence, a tiny app-info command the UI can read, and — in release
//! builds — owning the lifetime of the local media helper (Node + yt-dlp
//! sidecars) that powers the YouTube Music source. Playback, the local
//! database, tray, media-key integration and Discord RPC arrive in later
//! phases and will live in their own modules so this file stays a composition
//! root rather than a place where features accumulate.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

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

/// One minimal `GET /health` against the local helper.
///
/// Hand-rolled over `TcpStream` on purpose: this is a loopback liveness ping
/// to our own child process, and it must not drag an HTTP client dependency
/// (and its TLS stack) into a shell whose whole job is to stay small.
fn ping_helper(port: u16) -> bool {
    let target = format!("127.0.0.1:{port}");
    let addr = match target.to_socket_addrs() {
        Ok(mut iter) => match iter.next() {
            Some(addr) => addr,
            None => return false,
        },
        Err(_) => return false,
    };
    let mut stream = match TcpStream::connect_timeout(&addr, Duration::from_millis(1_500)) {
        Ok(stream) => stream,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1_500)));
    let request = "GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    // Reading one byte is enough to prove something answered; the helper's body
    // is irrelevant to liveness.
    let mut buf = [0u8; 1];
    matches!(stream.read(&mut buf), Ok(n) if n > 0)
}

/// Keep the helper alive for as long as this process is running.
///
/// The helper exits after a window without a `/health` beat, and until now the
/// only thing beating for it was the webview. Webview timers are throttled hard
/// whenever the window is minimised, occluded or backgrounded, so a perfectly
/// healthy app could lose its media helper mid-session and every later track
/// failed with "lost contact with the local media helper" until the app was
/// restarted.
///
/// The shell owns the helper's lifetime, so the shell is what should vouch for
/// it. This thread lives as long as the process and is not throttled by the
/// window manager; `RunEvent::Exit` still kills the child explicitly.
fn spawn_helper_heartbeat(port: u16) {
    std::thread::spawn(move || loop {
        // Beat faster than the helper's TTL so a single dropped packet is never
        // enough to kill it.
        std::thread::sleep(Duration::from_secs(5));
        let _ = ping_helper(port);
    });
}

/// Starts the bundled helper: `node.exe mediaHelper.bundle.mjs`, with
/// `YTDLP_PATH` pointing at the bundled `yt-dlp.exe`.
///
/// Layout (set up by `src-tauri/tauri.bundle.conf.json`): the two sidecars are
/// installed next to the app executable, the bundled helper script is a
/// resource under `helper/`.
/// Write a startup failure somewhere a user (or a bug report) can actually see.
/// A release build is a GUI app: `eprintln!` goes nowhere, which is how a
/// broken helper can end up looking like "the network is down".
fn log_startup_failure(message: &str) {
    append_startup_log(message);
    eprintln!("[crest] {message}");
}

fn append_startup_log(message: &str) {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            use std::io::Write;
            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(dir.join("crest-startup.log"))
            {
                let _ = writeln!(file, "{message}");
            }
        }
    }
}

/// Strip the Windows `\?` verbatim prefix from a path.
///
/// Win32 APIs accept either form, but Node does not: its module loader reads
/// the prefix as part of the path, so a helper launched with
/// `\?C:...mediaHelper.bundle.mjs` dies immediately with
/// "Cannot find module". `resource_dir()` returns the verbatim form, so it has
/// to be normalised before the path is handed to a child process.
fn strip_verbatim_prefix(path: std::path::PathBuf) -> std::path::PathBuf {
    #[cfg(windows)]
    {
        let text = path.to_string_lossy().to_string();
        if let Some(rest) = text.strip_prefix(r#"\\?\"#) {
            if let Some(unc) = rest.strip_prefix(r"UNC\") {
                return std::path::PathBuf::from(format!(r"\\{unc}"));
            }
            return std::path::PathBuf::from(rest);
        }
    }
    path
}

fn spawn_media_helper(app: &tauri::AppHandle) -> Result<Child, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or_else(|| "cannot locate the app directory".to_string())?;
    let node = strip_verbatim_prefix(exe_dir.join("node.exe"));
    let ytdlp = strip_verbatim_prefix(exe_dir.join("yt-dlp.exe"));

    // The helper script is a bundle resource. Where that lands depends on the
    // installer, and `resource_dir()` has pointed at different roots across
    // Tauri versions and install modes — so try the declared resource root
    // first and fall back to the directory the executable actually sits in.
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(dir) = app.path().resource_dir() {
        candidates.push(dir.join("helper").join("mediaHelper.bundle.mjs"));
    }
    candidates.push(exe_dir.join("helper").join("mediaHelper.bundle.mjs"));
    candidates.push(exe_dir.join("mediaHelper.bundle.mjs"));

    let script = candidates
        .iter()
        .find(|candidate| candidate.exists())
        .cloned()
        .map(strip_verbatim_prefix)
        .ok_or_else(|| {
            format!(
                "missing media helper script; looked in {}",
                candidates
                    .iter()
                    .map(|p| p.display().to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })?;

    for required in [&node, &ytdlp] {
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
                    Err(message) => log_startup_failure(&format!("media helper not started: {message}")),
                }
            }

            // Vouch for the helper from the shell, not only from the webview.
            // Must run in every build: in dev the Vite plugin owns the helper,
            // but the webview's throttled timers are just as capable of letting
            // it expire there.
            spawn_helper_heartbeat(5267);

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
        // after its heartbeat window closes, which covers a shell crash that
        // never reaches this branch.)
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
