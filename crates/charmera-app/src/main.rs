#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod state;

use state::AppState;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn detect_camera() -> Option<String> {
    charmera_core::import::find_camera().map(|p| p.display().to_string())
}

#[tauri::command]
fn list_camera_files(source: String) -> Result<Vec<state::FileInfo>, String> {
    let path = PathBuf::from(&source);
    let files = charmera_core::import::list_media_files(&path).map_err(|e| e.to_string())?;
    let infos: Vec<state::FileInfo> = files
        .into_iter()
        .filter_map(|f| {
            let meta = std::fs::metadata(&f).ok()?;
            let name = f.file_name()?.to_str()?.to_string();
            let is_photo = f
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| matches!(e.to_lowercase().as_str(), "jpg" | "jpeg"))
                .unwrap_or(false);
            Some(state::FileInfo {
                path: f.display().to_string(),
                name,
                size: meta.len(),
                is_photo,
            })
        })
        .collect();
    Ok(infos)
}

#[tauri::command]
fn import_folder(
    app: tauri::AppHandle,
    source: String,
) -> Result<state::ImportResult, String> {
    let app_state = app.state::<AppState>();
    app_state.import_from_path(&source).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_photos(
    app: tauri::AppHandle,
    offset: u32,
    limit: u32,
) -> Result<state::PhotoPage, String> {
    let app_state = app.state::<AppState>();
    app_state.get_photos(offset, limit).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_thumbnail_base64(path: String) -> Result<String, String> {
    read_image_as_base64(&path)
}

#[tauri::command]
fn get_photo_base64(app: tauri::AppHandle, id: i64) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    let file_path = app_state.get_photo_file_path(id).map_err(|e| e.to_string())?;
    read_image_as_base64(&file_path)
}

#[tauri::command]
fn preview_effect(
    app: tauri::AppHandle,
    id: i64,
    effects: Vec<String>,
    frame: Option<String>,
) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    app_state
        .preview_effect(id, &effects, frame.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn export_photo(
    app: tauri::AppHandle,
    id: i64,
    dest: String,
    effects: Vec<String>,
    frame: Option<String>,
) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    app_state
        .export_photo(id, &dest, &effects, frame.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn check_ai_status() -> Result<state::AiStatus, String> {
    let available = charmera_core::ai::check_ollama().unwrap_or(false);
    Ok(state::AiStatus {
        available,
        model: "moondream".to_string(),
    })
}

#[tauri::command]
fn auto_label_all(app: tauri::AppHandle) -> Result<state::LabelResult, String> {
    let app_state = app.state::<AppState>();
    let photos = app_state.get_unlabeled_photos().map_err(|e| e.to_string())?;
    let total = photos.len() as u32;
    let mut labeled = 0u32;
    let mut failed = 0u32;

    // Emit initial progress
    let _ = app.emit("label:progress", serde_json::json!({
        "done": 0, "total": total, "current": ""
    }));

    for (i, (id, file_path, thumb_path)) in photos.iter().enumerate() {
        let image_path = thumb_path.as_deref().unwrap_or("");
        if image_path.is_empty() {
            failed += 1;
            continue;
        }

        let file_name = std::path::Path::new(file_path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("photo");

        let _ = app.emit("label:progress", serde_json::json!({
            "done": i, "total": total, "current": file_name
        }));

        match charmera_core::ai::label_photo(std::path::Path::new(image_path)) {
            Ok(label) => {
                if let Err(e) = app_state.store_label(*id, &label) {
                    tracing::warn!("failed to store label for {id}: {e}");
                    failed += 1;
                } else {
                    labeled += 1;
                    tracing::info!("labeled {}: {}", file_name, label.description);
                }
            }
            Err(e) => {
                tracing::warn!("AI failed for {id}: {e}");
                failed += 1;
            }
        }
    }

    let _ = app.emit("label:progress", serde_json::json!({
        "done": total, "total": total, "current": "done"
    }));

    std::thread::sleep(std::time::Duration::from_millis(200));
    Ok(state::LabelResult { labeled, failed, total })
}

#[tauri::command]
fn get_rename_proposals(app: tauri::AppHandle) -> Result<Vec<state::RenameProposal>, String> {
    let app_state = app.state::<AppState>();
    app_state.get_rename_proposals().map_err(|e| e.to_string())
}

#[tauri::command]
fn apply_renames(app: tauri::AppHandle, renames: Vec<(i64, String)>) -> Result<u32, String> {
    let app_state = app.state::<AppState>();
    app_state.apply_renames(&renames).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_photo_labels(app: tauri::AppHandle, id: i64) -> Result<state::PhotoLabels, String> {
    let app_state = app.state::<AppState>();
    app_state.get_photo_labels(id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_all_tags(app: tauri::AppHandle) -> Result<Vec<charmera_core::catalog::TagInfo>, String> {
    let app_state = app.state::<AppState>();
    app_state.get_all_tags().map_err(|e| e.to_string())
}

#[tauri::command]
fn search_by_tag(
    app: tauri::AppHandle,
    tag: String,
) -> Result<state::PhotoPage, String> {
    let app_state = app.state::<AppState>();
    app_state.search_by_tag(&tag).map_err(|e| e.to_string())
}

#[tauri::command]
fn search_photos(
    app: tauri::AppHandle,
    query: String,
) -> Result<state::PhotoPage, String> {
    let app_state = app.state::<AppState>();
    app_state.search_photos(&query).map_err(|e| e.to_string())
}

fn read_image_as_base64(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("read {path}: {e}"))?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:image/jpeg;base64,{b64}"))
}

fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "charmera_app=info,charmera_core=info".into()),
        )
        .init();

    let app_state = AppState::new().expect("failed to initialize app state");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_app_version,
            detect_camera,
            list_camera_files,
            import_folder,
            get_photos,
            get_thumbnail_base64,
            get_photo_base64,
            preview_effect,
            export_photo,
            check_ai_status,
            auto_label_all,
            get_photo_labels,
            get_all_tags,
            search_by_tag,
            search_photos,
            get_rename_proposals,
            apply_renames,
        ])
        .run(tauri::generate_context!())
        .expect("error while running charmera companion");
}
