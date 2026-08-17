use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Serialize)]
struct NoteFile {
    slug: String,
    content: String,
    modified_ms: u64,
}

fn notes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .document_dir()
        .map_err(|e| e.to_string())?
        .join("Notavid");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// One path segment: unicode letters/digits plus `-` and `_`. Excluding `.`
/// and separators makes traversal impossible.
fn validate_segment(seg: &str) -> Result<(), String> {
    if seg.is_empty() || seg.len() > 200 {
        return Err("invalid name length".into());
    }
    if !seg
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err("name contains invalid characters".into());
    }
    Ok(())
}

/// Slugs become relative file paths: either `name` or `folder/name` (one
/// folder level). This is the path-traversal guard for every command below.
fn validate_slug(slug: &str) -> Result<(), String> {
    let segments: Vec<&str> = slug.split('/').collect();
    if segments.len() > 2 {
        return Err("too many path segments".into());
    }
    for seg in segments {
        validate_segment(seg)?;
    }
    Ok(())
}

fn note_path(app: &tauri::AppHandle, slug: &str) -> Result<PathBuf, String> {
    validate_slug(slug)?;
    let mut path = notes_dir(app)?;
    for seg in slug.split('/') {
        path = path.join(seg);
    }
    path.set_file_name(format!(
        "{}.md",
        path.file_name().and_then(|n| n.to_str()).unwrap_or("")
    ));
    Ok(path)
}

fn read_dir_notes(dir: &PathBuf, prefix: Option<&str>, notes: &mut Vec<NoteFile>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let modified_ms = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let slug = match prefix {
            Some(p) => format!("{p}/{stem}"),
            None => stem.to_string(),
        };
        notes.push(NoteFile {
            slug,
            content,
            modified_ms,
        });
    }
}

#[tauri::command]
fn list_notes(app: tauri::AppHandle) -> Result<Vec<NoteFile>, String> {
    let dir = notes_dir(&app)?;
    let mut notes = Vec::new();
    read_dir_notes(&dir, None, &mut notes);
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if validate_segment(name).is_err() {
            continue;
        }
        read_dir_notes(&path, Some(name), &mut notes);
    }
    Ok(notes)
}

#[tauri::command]
fn list_folders(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = notes_dir(&app)?;
    let mut folders = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if validate_segment(name).is_ok() {
                folders.push(name.to_string());
            }
        }
    }
    folders.sort();
    Ok(folders)
}

#[tauri::command]
fn create_folder(app: tauri::AppHandle, name: String) -> Result<(), String> {
    validate_segment(&name)?;
    fs::create_dir_all(notes_dir(&app)?.join(&name)).map_err(|e| e.to_string())
}

#[tauri::command]
fn read_note(app: tauri::AppHandle, slug: String) -> Result<String, String> {
    fs::read_to_string(note_path(&app, &slug)?).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_note(app: tauri::AppHandle, slug: String, content: String) -> Result<(), String> {
    let path = note_path(&app, &slug)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note(app: tauri::AppHandle, slug: String) -> Result<(), String> {
    let path = note_path(&app, &slug)?;
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// YouTube's embedded player rejects pages without a valid HTTP referer
/// (error 153). The packaged app runs on `tauri://localhost` on macOS/Linux,
/// which sends none — so we serve a tiny player wrapper page from a real
/// http origin on the loopback interface and embed that instead. The
/// wrapper talks to the app via postMessage (see player.ts).
static EMBED_HTML: &str = include_str!("embed.html");
static EMBED_PORT: std::sync::OnceLock<u16> = std::sync::OnceLock::new();

fn start_embed_server() -> u16 {
    use std::io::{Read, Write};
    let listener =
        std::net::TcpListener::bind(("127.0.0.1", 0)).expect("failed to bind embed server");
    let port = listener.local_addr().expect("embed server addr").port();
    std::thread::spawn(move || {
        for stream in listener.incoming() {
            let Ok(mut stream) = stream else { continue };
            std::thread::spawn(move || {
                // Drain the request head; every GET gets the same page.
                let mut buf = [0u8; 4096];
                let _ = stream.read(&mut buf);
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{}",
                    EMBED_HTML.len(),
                    EMBED_HTML
                );
                let _ = stream.write_all(resp.as_bytes());
            });
        }
    });
    port
}

#[tauri::command]
fn embed_port() -> u16 {
    *EMBED_PORT.get_or_init(start_embed_server)
}

/// Select the note's file in the system file manager (Finder on macOS).
#[tauri::command]
fn reveal_note(app: tauri::AppHandle, slug: String) -> Result<(), String> {
    let path = note_path(&app, &slug)?;
    tauri_plugin_opener::reveal_item_in_dir(path).map_err(|e| e.to_string())
}

/// Open the notes root folder in the system file manager.
#[tauri::command]
fn open_notes_dir(app: tauri::AppHandle) -> Result<(), String> {
    tauri_plugin_opener::open_path(notes_dir(&app)?, None::<&str>).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|_| {
            // Eager so the first video doesn't pay the startup cost.
            EMBED_PORT.get_or_init(start_embed_server);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            list_folders,
            create_folder,
            read_note,
            write_note,
            delete_note,
            reveal_note,
            open_notes_dir,
            embed_port
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
