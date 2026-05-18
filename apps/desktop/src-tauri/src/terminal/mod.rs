use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DetectedShell {
    pub id: String,
    pub name: String,
    pub executable_path: String,
    pub args: Vec<String>,
    pub platform: String,
    pub is_default: bool,
    pub is_available: bool,
    pub source: String,
}

// ── Internal event payloads ───────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PtyDataEvent {
    session_id: String,
    data: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PtyExitEvent {
    session_id: String,
    code: i32,
}

// ── PTY session internals ─────────────────────────────────────────────────────

enum PtyCmd {
    Write(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Kill,
}

struct PtySessionHandle {
    tx: std::sync::mpsc::SyncSender<PtyCmd>,
}

// ── Manager (Tauri managed state) ─────────────────────────────────────────────

pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<String, PtySessionHandle>>>,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// ── Shell detection ───────────────────────────────────────────────────────────

/// All known locations for each shell, in preference order.
/// We collect every unique path found — so users with both system bash
/// (/bin/bash) and Homebrew bash (/opt/homebrew/bin/bash) see both.
#[cfg(any(target_os = "macos", target_os = "linux"))]
const UNIX_SHELLS: &[(&str, &str, &[&str], &[&str])] = &[
    // (bin_name, display_label, login_args, extra_known_paths)
    (
        "zsh", "Zsh", &["-l"],
        &["/bin/zsh", "/usr/bin/zsh", "/usr/local/bin/zsh", "/opt/homebrew/bin/zsh"],
    ),
    (
        "bash", "Bash", &["-l"],
        &[
            "/bin/bash",
            "/usr/bin/bash",
            "/usr/local/bin/bash",
            "/opt/homebrew/bin/bash",   // Homebrew bash 5.x (macOS)
            "/opt/local/bin/bash",      // MacPorts
        ],
    ),
    (
        "fish", "Fish", &[],
        &[
            "/usr/bin/fish",
            "/usr/local/bin/fish",
            "/opt/homebrew/bin/fish",
            "/opt/local/bin/fish",
        ],
    ),
    (
        "sh", "Sh", &[],
        &["/bin/sh", "/usr/bin/sh"],
    ),
    (
        "dash", "Dash", &[],
        &["/bin/dash", "/usr/bin/dash"],
    ),
    (
        "ksh", "Ksh", &["-l"],
        &["/bin/ksh", "/usr/bin/ksh", "/usr/local/bin/ksh"],
    ),
];

/// Resolve every path at which a shell binary is installed.
/// Strategy (in order):
///   1. `which <bin>` — honours the user's $PATH, catches unusual installs
///   2. All extra_known_paths for this shell — catches paths not in $PATH
/// Deduplicates by resolved path.
#[cfg(any(target_os = "macos", target_os = "linux"))]
fn find_all_paths(bin: &str, extra_paths: &[&str]) -> Vec<(String, &'static str)> {
    let mut found: Vec<String> = Vec::new();

    // 1. `which` (may return the first match on $PATH)
    if let Ok(out) = std::process::Command::new("which").arg(bin).output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() && std::path::Path::new(&p).is_file() {
                found.push(p);
            }
        }
    }

    // 2. Hard-coded known paths
    for &p in extra_paths {
        if std::path::Path::new(p).is_file() && !found.contains(&p.to_string()) {
            found.push(p.to_string());
        }
    }

    // Tag each with its source
    found
        .into_iter()
        .map(|p| {
            let src = if extra_paths.contains(&p.as_str()) { "known-path" } else { "system" };
            (p, src)
        })
        .collect()
}

#[tauri::command]
pub async fn detect_shells() -> Vec<DetectedShell> {
    let mut shells: Vec<DetectedShell> = Vec::new();

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let platform = if cfg!(target_os = "macos") { "macos" } else { "linux" };

        // Track the $SHELL default path so we can badge it correctly
        let default_path = std::env::var("SHELL").unwrap_or_default();

        for (bin, label, args, extra_paths) in UNIX_SHELLS {
            let paths = find_all_paths(bin, extra_paths);
            for (path, src) in paths {
                // Skip duplicates (same path already added by an earlier shell entry)
                if shells.iter().any(|s: &DetectedShell| s.executable_path == path) {
                    continue;
                }
                let is_default = path == default_path;
                // Display name: badge the $SHELL entry so it's obvious
                let name = if is_default {
                    format!("{} (default)", label)
                } else {
                    // If multiple paths for the same shell, show the path suffix to distinguish
                    // e.g. "Bash  (/opt/homebrew)" vs plain "Bash"
                    label.to_string()
                };
                // Stable ID: use the path so each install has its own unique entry
                let id = path
                    .trim_start_matches('/')
                    .replace('/', "-");
                shells.push(DetectedShell {
                    id,
                    name,
                    executable_path: path,
                    args: args.iter().map(|s| s.to_string()).collect(),
                    platform: platform.into(),
                    is_default,
                    is_available: true,
                    source: src.to_string(),
                });
            }
        }

        // Sort: default first, then alphabetically by name
        shells.sort_by(|a, b| {
            b.is_default
                .cmp(&a.is_default)
                .then_with(|| a.name.cmp(&b.name))
        });
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        // PowerShell Core (pwsh)
        if let Ok(out) = Command::new("where").arg("pwsh.exe").output() {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .next()
                    .unwrap_or("pwsh.exe")
                    .trim()
                    .to_string();
                shells.push(DetectedShell {
                    id: "pwsh".into(),
                    name: "PowerShell".into(),
                    executable_path: path,
                    args: vec!["-NoLogo".into()],
                    platform: "windows".into(),
                    is_default: true,
                    is_available: true,
                    source: "system".into(),
                });
            }
        }

        // Windows PowerShell (built-in)
        let ps1 = r"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe";
        if std::path::Path::new(ps1).exists() {
            shells.push(DetectedShell {
                id: "powershell".into(),
                name: "Windows PowerShell".into(),
                executable_path: ps1.into(),
                args: vec!["-NoLogo".into()],
                platform: "windows".into(),
                is_default: shells.is_empty(),
                is_available: true,
                source: "known-path".into(),
            });
        }

        // Command Prompt
        let cmd_path = r"C:\Windows\System32\cmd.exe";
        shells.push(DetectedShell {
            id: "cmd".into(),
            name: "Command Prompt".into(),
            executable_path: cmd_path.into(),
            args: vec![],
            platform: "windows".into(),
            is_default: false,
            is_available: std::path::Path::new(cmd_path).exists(),
            source: "known-path".into(),
        });

        // Git Bash
        for path in &[
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
        ] {
            if std::path::Path::new(path).exists() {
                shells.push(DetectedShell {
                    id: "git-bash".into(),
                    name: "Git Bash".into(),
                    executable_path: path.to_string(),
                    args: vec!["--login".into(), "-i".into()],
                    platform: "windows".into(),
                    is_default: false,
                    is_available: true,
                    source: "known-path".into(),
                });
                break;
            }
        }

        // WSL distributions
        if let Ok(out) = Command::new("wsl.exe").args(["-l", "-q"]).output() {
            if out.status.success() {
                let raw = String::from_utf16_lossy(
                    &out.stdout
                        .chunks(2)
                        .map(|c| u16::from_le_bytes([c[0], *c.get(1).unwrap_or(&0)]))
                        .collect::<Vec<u16>>(),
                );
                for line in raw.lines() {
                    let distro = line.trim().trim_end_matches(" (Default)");
                    if distro.is_empty() {
                        continue;
                    }
                    let id = format!("wsl-{}", distro.to_lowercase().replace(' ', "-"));
                    shells.push(DetectedShell {
                        id,
                        name: format!("WSL: {distro}"),
                        executable_path: "wsl.exe".into(),
                        args: vec!["-d".into(), distro.to_string(), "--".into(), "bash".into(), "-l".into()],
                        platform: "windows".into(),
                        is_default: false,
                        is_available: true,
                        source: "system".into(),
                    });
                }
            }
        }

        // Ensure at least one default
        if let Some(first) = shells.first_mut() {
            if !shells.iter().any(|s| s.is_default) {
                first.is_default = true;
            }
        }
    }

    shells
}

// ── PTY session lifecycle ─────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePtyPayload {
    pub shell: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub env: HashMap<String, String>,
    pub cols: u16,
    pub rows: u16,
}

#[tauri::command]
pub async fn pty_create(
    state: tauri::State<'_, PtyManager>,
    app_handle: AppHandle,
    payload: CreatePtyPayload,
) -> Result<String, String> {
    // Validate shell exists (absolute path) or is findable in PATH
    let shell_exists = std::path::Path::new(&payload.shell).is_file()
        || which_in_path(&payload.shell);
    if !shell_exists {
        return Err(format!(
            "Shell not found: '{}'. Choose another shell in Settings → Terminal.",
            payload.shell
        ));
    }

    // Resolve working directory — fall back to home
    let cwd = if std::path::Path::new(&payload.cwd).is_dir() {
        payload.cwd.clone()
    } else {
        home_dir()
    };

    let session_id = Uuid::new_v4().to_string();
    let sid = session_id.clone();
    let sessions_arc = Arc::clone(&state.sessions);

    let (tx, rx) = std::sync::mpsc::sync_channel::<PtyCmd>(128);

    let shell = payload.shell.clone();
    let args = payload.args.clone();
    let env = payload.env.clone();
    let cols = payload.cols;
    let rows = payload.rows;

    std::thread::spawn(move || {
        let pty_system = native_pty_system();

        let pair = match pty_system.openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }) {
            Ok(p) => p,
            Err(e) => {
                let _ = app_handle.emit("pty-exit", PtyExitEvent { session_id: sid.clone(), code: -1 });
                eprintln!("[alloy-pty] openpty failed: {e}");
                return;
            }
        };

        let mut cmd = CommandBuilder::new(&shell);
        for arg in &args {
            cmd.arg(arg);
        }
        cmd.cwd(&cwd);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "Alloy");
        for (k, v) in &env {
            cmd.env(k, v);
        }

        let mut child = match pair.slave.spawn_command(cmd) {
            Ok(c) => c,
            Err(e) => {
                let _ = app_handle.emit(
                    "pty-exit",
                    PtyExitEvent { session_id: sid.clone(), code: -1 },
                );
                eprintln!("[alloy-pty] spawn_command failed: {e}");
                return;
            }
        };
        // Close slave in parent — child inherited it already
        drop(pair.slave);

        let mut reader = match pair.master.try_clone_reader() {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[alloy-pty] clone_reader failed: {e}");
                return;
            }
        };

        let mut writer = match pair.master.take_writer() {
            Ok(w) => w,
            Err(e) => {
                eprintln!("[alloy-pty] take_writer failed: {e}");
                return;
            }
        };

        // Spawn dedicated reader thread — streams PTY output to the frontend
        let reader_sid = sid.clone();
        let reader_ah = app_handle.clone();
        let reader_sessions = Arc::clone(&sessions_arc);
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = reader_ah.emit(
                            "pty-data",
                            PtyDataEvent { session_id: reader_sid.clone(), data },
                        );
                    }
                }
            }
            // Child exited — clean up session and notify frontend
            reader_sessions.lock().unwrap().remove(&reader_sid);
            let _ = reader_ah.emit(
                "pty-exit",
                PtyExitEvent { session_id: reader_sid.clone(), code: 0 },
            );
        });

        // Command loop — handles writes, resizes, and explicit kills
        loop {
            match rx.recv() {
                Ok(PtyCmd::Write(data)) => {
                    let _ = writer.write_all(&data);
                    let _ = writer.flush();
                }
                Ok(PtyCmd::Resize { cols, rows }) => {
                    let _ = pair.master.resize(PtySize {
                        rows,
                        cols,
                        pixel_width: 0,
                        pixel_height: 0,
                    });
                }
                Ok(PtyCmd::Kill) | Err(_) => {
                    let _ = child.kill();
                    drop(pair.master);
                    break;
                }
            }
        }
    });

    state.sessions.lock().unwrap().insert(session_id.clone(), PtySessionHandle { tx });

    Ok(session_id)
}

#[tauri::command]
pub async fn pty_write(
    state: tauri::State<'_, PtyManager>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    match sessions.get(&session_id) {
        Some(h) => h
            .tx
            .try_send(PtyCmd::Write(data.into_bytes()))
            .map_err(|e| format!("Write failed: {e}")),
        None => Err(format!("Session not found: {session_id}")),
    }
}

#[tauri::command]
pub async fn pty_resize(
    state: tauri::State<'_, PtyManager>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    match sessions.get(&session_id) {
        Some(h) => h
            .tx
            .try_send(PtyCmd::Resize { cols, rows })
            .map_err(|e| format!("Resize failed: {e}")),
        None => Err(format!("Session not found: {session_id}")),
    }
}

#[tauri::command]
pub async fn pty_kill(
    state: tauri::State<'_, PtyManager>,
    session_id: String,
) -> Result<(), String> {
    let handle = state.sessions.lock().unwrap().remove(&session_id);
    if let Some(h) = handle {
        let _ = h.tx.try_send(PtyCmd::Kill);
        Ok(())
    } else {
        Err(format!("Session not found: {session_id}"))
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn which_in_path(name: &str) -> bool {
    let checker = if cfg!(target_os = "windows") { "where" } else { "which" };
    std::process::Command::new(checker)
        .arg(name)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn home_dir() -> String {
    #[allow(deprecated)]
    std::env::home_dir()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}
