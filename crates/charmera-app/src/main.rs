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
fn generate_demo_photos(app: tauri::AppHandle) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    let demo_dir = app_state.data_dir().join("demo");
    std::fs::create_dir_all(&demo_dir).map_err(|e| e.to_string())?;

    // Generate 6 sample photos with different colors (simulating camera output)
    let samples = [
        ([180, 140, 100], "PICT0001.jpg"),
        ([100, 160, 190], "PICT0002.jpg"),
        ([160, 180, 110], "PICT0003.jpg"),
        ([190, 120, 140], "PICT0004.jpg"),
        ([140, 130, 180], "PICT0005.jpg"),
        ([170, 170, 130], "PICT0006.jpg"),
    ];

    for (color, name) in &samples {
        let path = demo_dir.join(name);
        if path.exists() {
            continue;
        }
        // Create a 1440x1080 JPEG (same as KODAK CHARMERA resolution)
        let img = image::RgbImage::from_fn(1440, 1080, |x, y| {
            // Simple gradient pattern
            let r = (color[0] as f32 + (x as f32 / 1440.0 * 40.0)) as u8;
            let g = (color[1] as f32 + (y as f32 / 1080.0 * 40.0)) as u8;
            let b = color[2];
            image::Rgb([r, g, b])
        });
        let mut buf =
            std::io::BufWriter::new(std::fs::File::create(&path).map_err(|e| e.to_string())?);
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, 85);
        img.write_with_encoder(encoder).map_err(|e| e.to_string())?;
    }

    Ok(demo_dir.display().to_string())
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
                .map(|e| {
                    matches!(
                        e.to_lowercase().as_str(),
                        "jpg" | "jpeg" | "png" | "bmp" | "webp"
                    )
                })
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
fn import_folder(app: tauri::AppHandle, source: String) -> Result<(), String> {
    // Return immediately, do import in background thread (prevents UI freeze)
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let app_state = app_handle.state::<AppState>();
        let emitter_handle = app_handle.clone();
        let emitter = move |done: u32, total: u32, current: &str| {
            let _ = emitter_handle.emit(
                "import:progress",
                serde_json::json!({
                    "done": done,
                    "total": total,
                    "current": current,
                }),
            );
        };
        // Need a fresh handle for the done event (emitter consumed the other clone)
        let done_handle = app_handle.clone();
        match app_state.import_from_path_with_progress(&source, &emitter) {
            Ok(result) => {
                tracing::info!(
                    "emitting import:done — imported={}, skipped={}",
                    result.imported,
                    result.skipped
                );
                let _ = done_handle.emit(
                    "import:done",
                    serde_json::json!({
                        "imported": result.imported,
                        "skipped": result.skipped,
                        "total_files": result.total_files,
                    }),
                );
            }
            Err(e) => {
                tracing::warn!("import error: {e}");
                let _ = done_handle.emit(
                    "import:done",
                    serde_json::json!({
                        "imported": 0,
                        "skipped": 0,
                        "total_files": 0,
                        "error": e.to_string(),
                    }),
                );
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn get_photos(app: tauri::AppHandle, offset: u32, limit: u32) -> Result<state::PhotoPage, String> {
    let app_state = app.state::<AppState>();
    app_state
        .get_photos(offset, limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_recent_photos(
    app: tauri::AppHandle,
    hours: Option<u32>,
) -> Result<state::PhotoPage, String> {
    let app_state = app.state::<AppState>();
    app_state
        .get_recent_photos(hours.unwrap_or(24))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_thumbnail_base64(path: String) -> Result<String, String> {
    read_image_as_base64(&path)
}

#[tauri::command]
fn get_photo_base64(app: tauri::AppHandle, id: i64) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    let file_path = app_state
        .get_photo_file_path(id)
        .map_err(|e| e.to_string())?;
    read_image_as_base64(&file_path)
}

#[tauri::command]
fn export_photo(app: tauri::AppHandle, id: i64, dest: String) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    app_state.export_photo(id, &dest).map_err(|e| e.to_string())
}

#[tauri::command]
fn check_ai_status() -> Result<state::AiStatus, String> {
    let models = charmera_core::ai::list_vision_models().unwrap_or_default();
    let best = charmera_core::ai::best_available_model().unwrap_or_default();
    Ok(state::AiStatus {
        available: !models.is_empty(),
        model: best,
        models,
    })
}

#[tauri::command]
fn auto_label_all(app: tauri::AppHandle) -> Result<u32, String> {
    let app_state = app.state::<AppState>();
    let photos = app_state
        .get_unlabeled_photos()
        .map_err(|e| e.to_string())?;
    let total = photos.len() as u32;

    if total == 0 {
        let _ = app.emit(
            "label:done",
            serde_json::json!({
                "labeled": 0, "failed": 0, "total": 0
            }),
        );
        return Ok(0);
    }

    // Return immediately, do work in background thread
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let app_state = app_handle.state::<AppState>();
        let mut labeled = 0u32;
        let mut failed = 0u32;

        for (i, (id, file_path, thumb_path)) in photos.iter().enumerate() {
            let image_path = thumb_path.as_deref().unwrap_or("");
            if image_path.is_empty() {
                failed += 1;
                continue;
            }

            let file_name = std::path::Path::new(file_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("photo")
                .to_string();

            let _ = app_handle.emit(
                "label:progress",
                serde_json::json!({
                    "done": i, "total": total, "current": file_name
                }),
            );

            match charmera_core::ai::label_photo(std::path::Path::new(image_path)) {
                Ok(label) => {
                    if let Err(e) = app_state.store_label(*id, &label) {
                        tracing::warn!("failed to store label for {id}: {e}");
                        failed += 1;
                    } else {
                        labeled += 1;
                        // Emit per-photo completion so UI updates live
                        let _ = app_handle.emit(
                            "label:photo_done",
                            serde_json::json!({
                                "id": id,
                                "description": label.description,
                                "tags": label.tags,
                                "done": i + 1,
                                "total": total,
                            }),
                        );
                    }
                }
                Err(e) => {
                    tracing::warn!("AI failed for {id}: {e}");
                    failed += 1;
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(200));
        let _ = app_handle.emit(
            "label:done",
            serde_json::json!({
                "labeled": labeled, "failed": failed, "total": total
            }),
        );
    });

    // Return immediately with count of photos to process
    Ok(total)
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
fn export_labels_json(app: tauri::AppHandle) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    let catalog = app_state.catalog_lock().map_err(|e| e.to_string())?;
    let mut stmt = catalog
        .read_conn()
        .prepare(
            "SELECT p.id, p.file_path, p.relative_path, p.description, p.taken_at,
                    p.width, p.height, p.original_name
             FROM photos p WHERE p.is_hidden = 0
             ORDER BY p.id",
        )
        .map_err(|e| e.to_string())?;

    let photos: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            let id: i64 = row.get(0)?;
            let _file_path: String = row.get(1)?;
            let relative_path: String = row.get(2)?;
            let description: Option<String> = row.get(3)?;
            let taken_at: Option<String> = row.get(4)?;
            let width: u32 = row.get(5)?;
            let height: u32 = row.get(6)?;
            let original_name: Option<String> = row.get(7)?;
            Ok(serde_json::json!({
                "id": id,
                "file": relative_path,
                "original_name": original_name,
                "description": description,
                "taken_at": taken_at,
                "width": width,
                "height": height,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    serde_json::to_string_pretty(&serde_json::json!({
        "export_date": chrono::Local::now().to_rfc3339(),
        "total": photos.len(),
        "photos": photos,
    }))
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn search_by_tag(app: tauri::AppHandle, tag: String) -> Result<state::PhotoPage, String> {
    let app_state = app.state::<AppState>();
    app_state.search_by_tag(&tag).map_err(|e| e.to_string())
}

#[tauri::command]
fn search_photos(app: tauri::AppHandle, query: String) -> Result<state::PhotoPage, String> {
    let app_state = app.state::<AppState>();
    app_state.search_photos(&query).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_naming_pattern(app: tauri::AppHandle) -> Result<String, String> {
    let app_state = app.state::<AppState>();
    let pattern = app_state
        .get_setting("naming_pattern")
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "b {MM}-{DD}-{YYYY} {content}".to_string());
    Ok(pattern)
}

#[tauri::command]
fn set_naming_pattern(app: tauri::AppHandle, pattern: String) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    app_state
        .set_setting("naming_pattern", &pattern)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_setting(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let app_state = app.state::<AppState>();
    app_state.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_setting(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    app_state
        .set_setting(&key, &value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_duplicates(app: tauri::AppHandle) -> Result<Vec<state::DuplicateGroup>, String> {
    let app_state = app.state::<AppState>();
    app_state.get_duplicates().map_err(|e| e.to_string())
}

#[tauri::command]
fn preview_splash(source_path: String) -> Result<String, String> {
    let img = image::open(&source_path).map_err(|e| format!("open {source_path}: {e}"))?;
    let splash = charmera_core::splash::create_splash(&img);
    // Encode to base64
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 85);
    splash
        .to_rgb8()
        .write_with_encoder(encoder)
        .map_err(|e| format!("encode: {e}"))?;
    drop(cursor);
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/jpeg;base64,{b64}"))
}

#[tauri::command]
fn install_splash(source_path: String) -> Result<String, String> {
    let img = image::open(&source_path).map_err(|e| format!("open {source_path}: {e}"))?;
    let splash = charmera_core::splash::create_splash(&img);

    let camera = charmera_core::import::find_camera()
        .ok_or_else(|| "No camera connected. Please plug in your KODAK CHARMERA.".to_string())?;

    let splash_dir = camera.join(charmera_core::constants::SPLASH_DIR);
    std::fs::create_dir_all(&splash_dir).map_err(|e| format!("create dir: {e}"))?;

    let dest = splash_dir.join(charmera_core::constants::SPLASH_FILE);
    charmera_core::splash::save_splash(&splash, &dest).map_err(|e| e.to_string())?;

    Ok(dest.display().to_string())
}

#[tauri::command]
fn hide_photo(app: tauri::AppHandle, id: i64) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    let catalog = app_state.catalog_lock().map_err(|e| e.to_string())?;
    catalog
        .write(charmera_core::catalog::WriteOp::HidePhoto(id))
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct CloudDrive {
    provider: String,
    path: String,
    account: String,
}

#[tauri::command]
fn detect_cloud_drives() -> Vec<CloudDrive> {
    let mut drives = Vec::new();
    let home = dirs_next::home_dir().unwrap_or_default();
    let cloud_storage = home.join("Library/CloudStorage");

    if let Ok(entries) = std::fs::read_dir(&cloud_storage) {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            // Google Drive: GoogleDrive-{email}/My Drive/
            if name.starts_with("GoogleDrive-") {
                let my_drive = entry.path().join("My Drive");
                if my_drive.is_dir() {
                    let account = name.strip_prefix("GoogleDrive-").unwrap_or("").to_string();
                    drives.push(CloudDrive {
                        provider: "google-drive".into(),
                        path: my_drive.display().to_string(),
                        account,
                    });
                }
            }
            // Dropbox: Dropbox/ or Dropbox-{account}/
            if name.starts_with("Dropbox") && entry.path().is_dir() {
                let account = name
                    .strip_prefix("Dropbox-")
                    .unwrap_or("Dropbox")
                    .to_string();
                drives.push(CloudDrive {
                    provider: "dropbox".into(),
                    path: entry.path().display().to_string(),
                    account,
                });
            }
        }
    }

    // Legacy Dropbox: ~/Dropbox/
    let legacy_dropbox = home.join("Dropbox");
    if legacy_dropbox.is_dir() && !drives.iter().any(|d| d.provider == "dropbox") {
        drives.push(CloudDrive {
            provider: "dropbox".into(),
            path: legacy_dropbox.display().to_string(),
            account: "Dropbox".into(),
        });
    }

    drives
}

#[tauri::command]
fn detect_nas_volumes() -> Result<Vec<String>, String> {
    let mut volumes = Vec::new();
    let skip = ["Macintosh HD", "Recovery", "Preboot", "VM", "Update"];
    if let Ok(entries) = std::fs::read_dir("/Volumes") {
        for entry in entries.filter_map(|e| e.ok()) {
            let name = entry.file_name().to_string_lossy().to_string();
            if !skip.iter().any(|s| name.contains(s)) && entry.path().is_dir() {
                volumes.push(entry.path().display().to_string());
            }
        }
    }
    // Also check Linux mount points
    for dir in ["/media", "/mnt"] {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if entry.path().is_dir() {
                    volumes.push(entry.path().display().to_string());
                }
            }
        }
    }
    Ok(volumes)
}

#[tauri::command]
fn test_nas_path(path: String) -> Result<bool, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(false);
    }
    // Try writing a test file to verify write access
    let test_file = p.join(".charmera_test");
    match std::fs::write(&test_file, "test") {
        Ok(_) => {
            let _ = std::fs::remove_file(&test_file);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
fn get_nas_config(app: tauri::AppHandle) -> Result<state::NasConfig, String> {
    let app_state = app.state::<AppState>();
    app_state.get_nas_config().map_err(|e| e.to_string())
}

#[tauri::command]
fn set_nas_config(app: tauri::AppHandle, config: state::NasConfig) -> Result<(), String> {
    let app_state = app.state::<AppState>();
    app_state.set_nas_config(&config).map_err(|e| e.to_string())
}

#[tauri::command]
fn move_to_nas(
    app: tauri::AppHandle,
    photo_ids: Vec<i64>,
    keep_local: bool,
) -> Result<(u32, u32), String> {
    let app_state = app.state::<AppState>();
    app_state
        .move_photos_to_nas(&photo_ids, keep_local)
        .map_err(|e| e.to_string())
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
            generate_demo_photos,
            detect_camera,
            list_camera_files,
            import_folder,
            get_photos,
            get_recent_photos,
            get_thumbnail_base64,
            get_photo_base64,
            export_photo,
            check_ai_status,
            auto_label_all,
            get_photo_labels,
            get_all_tags,
            export_labels_json,
            search_by_tag,
            search_photos,
            get_rename_proposals,
            apply_renames,
            get_duplicates,
            preview_splash,
            install_splash,
            hide_photo,
            get_naming_pattern,
            set_naming_pattern,
            get_setting,
            set_setting,
            detect_cloud_drives,
            detect_nas_volumes,
            test_nas_path,
            get_nas_config,
            set_nas_config,
            move_to_nas,
        ])
        .run(tauri::generate_context!())
        .expect("error while running charmera companion");
}
