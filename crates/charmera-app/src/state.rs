use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result};
use charmera_core::catalog::WriteOp;
use charmera_core::catalog::{Catalog, PhotoInsert, PhotoSummary};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
pub struct NasConfig {
    pub enabled: bool,
    pub path: String,
    pub auto_move: bool,
    pub organize_by_date: bool,
}

#[derive(Serialize, Clone)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub is_photo: bool,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: u32,
    pub skipped: u32,
    pub total_files: u32,
}

#[derive(Serialize)]
pub struct PhotoPage {
    pub photos: Vec<PhotoSummary>,
    pub total: u32,
}

#[derive(Serialize)]
pub struct AiStatus {
    pub available: bool,
    pub model: String,
    pub models: Vec<String>,
    /// Why AI is unavailable, when it is. The three failure modes (Ollama not
    /// installed / not running / running but no vision model pulled) need
    /// different fixes, so collapsing them into `available: false` leaves the
    /// user with a dead end.
    pub reason: Option<String>,
}

#[derive(Serialize)]
pub struct RenameOutcome {
    pub renamed: u32,
    pub skipped: u32,
}

#[derive(Serialize)]
pub struct PhotoLabels {
    pub description: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Serialize, Clone)]
pub struct DuplicateGroup {
    pub hash_hex: String,
    pub photos: Vec<PhotoSummary>,
}

#[derive(Serialize, Clone)]
pub struct RenameProposal {
    pub id: i64,
    pub current_name: String,
    pub proposed_name: String,
    pub description: String,
    pub file_path: String,
    pub thumbnail_path: Option<String>,
}

pub struct AppState {
    catalog: Mutex<Catalog>,
    data_dir: PathBuf,
    thumbnail_dir: PathBuf,
}

impl AppState {
    pub fn new() -> Result<Self> {
        let home = dirs_next::home_dir().context("could not find home directory")?;
        let data_dir = home.join(charmera_core::constants::APP_DIR_NAME);
        std::fs::create_dir_all(&data_dir)?;

        let db_path = data_dir.join("catalog.db");
        let thumbnail_dir = data_dir.join("thumbnails");
        std::fs::create_dir_all(&thumbnail_dir)?;

        let catalog = Catalog::open(&db_path)?;

        tracing::info!("catalog opened at {}", db_path.display());
        tracing::info!("thumbnails at {}", thumbnail_dir.display());

        Ok(Self {
            catalog: Mutex::new(catalog),
            data_dir,
            thumbnail_dir,
        })
    }

    pub fn data_dir(&self) -> &Path {
        &self.data_dir
    }

    pub fn photos_dir(&self) -> PathBuf {
        let dir = self.data_dir.join("photos");
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    /// Resolve a frontend-supplied thumbnail path, refusing anything outside
    /// the thumbnail cache.
    ///
    /// The webview can invoke commands with arbitrary arguments, so an
    /// unchecked path here is a "read any file on disk and hand it back
    /// base64-encoded" primitive. Canonicalize both sides so `..` and symlinks
    /// can't be used to escape.
    pub fn resolve_thumbnail_path(&self, path: &str) -> Result<PathBuf> {
        let root = self
            .thumbnail_dir
            .canonicalize()
            .unwrap_or_else(|_| self.thumbnail_dir.clone());
        let candidate = Path::new(path)
            .canonicalize()
            .with_context(|| format!("thumbnail not found: {path}"))?;

        if !candidate.starts_with(&root) {
            anyhow::bail!("refusing to read outside the thumbnail cache: {path}");
        }
        Ok(candidate)
    }

    /// Get a setting value.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        catalog.get_setting(key)
    }

    /// Set a setting value.
    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        catalog.write(WriteOp::SetSetting(key.to_string(), value.to_string()))
    }

    /// Get NAS configuration from settings.
    pub fn get_nas_config(&self) -> Result<NasConfig> {
        Ok(NasConfig {
            enabled: self
                .get_setting("nas_enabled")?
                .map(|v| v == "true")
                .unwrap_or(false),
            path: self.get_setting("nas_path")?.unwrap_or_default(),
            auto_move: self
                .get_setting("nas_auto_move")?
                .map(|v| v == "true")
                .unwrap_or(false),
            organize_by_date: self
                .get_setting("nas_organize_by_date")?
                .map(|v| v == "true")
                .unwrap_or(true),
        })
    }

    /// Set NAS configuration in settings.
    pub fn set_nas_config(&self, config: &NasConfig) -> Result<()> {
        self.set_setting("nas_enabled", &config.enabled.to_string())?;
        self.set_setting("nas_path", &config.path)?;
        self.set_setting("nas_auto_move", &config.auto_move.to_string())?;
        self.set_setting("nas_organize_by_date", &config.organize_by_date.to_string())?;
        Ok(())
    }

    /// Move photos to NAS storage. Returns (moved_count, failed_count).
    pub fn move_photos_to_nas(&self, photo_ids: &[i64], keep_local: bool) -> Result<(u32, u32)> {
        let config = self.get_nas_config()?;
        if !config.enabled || config.path.is_empty() {
            anyhow::bail!("NAS not configured");
        }
        let nas_base = PathBuf::from(&config.path);
        if !nas_base.exists() {
            anyhow::bail!("NAS path not accessible: {}", config.path);
        }

        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut moved = 0u32;
        let mut failed = 0u32;

        for id in photo_ids {
            let row: (String, Option<String>) = catalog.read_conn().query_row(
                "SELECT file_path, taken_at FROM photos WHERE id = ?1",
                [id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            let (file_path, taken_at) = row;

            let src = Path::new(&file_path);
            if !src.exists() {
                failed += 1;
                continue;
            }

            // Build NAS destination path
            let dest_dir = if config.organize_by_date {
                let date_folder = taken_at
                    .as_deref()
                    .and_then(|d| {
                        // Parse "YYYY:MM:DD" or "YYYY-MM-DD" -> "YYYY-MM"
                        let normalized = d.replace(':', "-");
                        if normalized.chars().count() >= 7 {
                            Some(normalized.chars().take(7).collect::<String>())
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| chrono::Local::now().format("%Y-%m").to_string());
                nas_base.join(&date_folder)
            } else {
                nas_base.clone()
            };

            if let Err(e) = std::fs::create_dir_all(&dest_dir) {
                tracing::warn!("NAS mkdir failed for {id}: {e}");
                failed += 1;
                continue;
            }
            let file_name = src.file_name().unwrap_or_default();
            let dest = dest_dir.join(file_name);

            // Copy to NAS
            if let Err(e) = std::fs::copy(src, &dest) {
                tracing::warn!("NAS copy failed for {id}: {e}");
                failed += 1;
                continue;
            }

            // Update catalog to NAS path
            let dest_str = dest.display().to_string();
            catalog.write(WriteOp::Custom(Box::new({
                let dest_str = dest_str.clone();
                let id = *id;
                move |conn| {
                    conn.execute(
                        "UPDATE photos SET file_path = ?1 WHERE id = ?2",
                        rusqlite::params![dest_str, id],
                    )?;
                    Ok(())
                }
            })))?;

            // Delete local copy if requested
            if !keep_local {
                let _ = std::fs::remove_file(src);
            }

            moved += 1;
        }

        Ok((moved, failed))
    }

    pub fn import_from_path_with_progress(
        &self,
        source: &str,
        on_progress: &dyn Fn(u32, u32, &str),
    ) -> Result<ImportResult> {
        let source_path = PathBuf::from(source);
        let files = charmera_core::import::list_media_files(&source_path)?;
        let total_files = files.len() as u32;
        let mut imported = 0u32;
        let mut skipped = 0u32;

        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;

        for file_path in &files {
            let ext = file_path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if !matches!(
                ext.to_lowercase().as_str(),
                "jpg" | "jpeg" | "png" | "bmp" | "webp"
            ) {
                skipped += 1;
                continue;
            }

            // Wrap per-file processing so one failure doesn't abort the entire import
            match self.import_single_file(
                file_path,
                &source_path,
                &catalog,
                on_progress,
                imported,
                skipped,
                total_files,
            ) {
                Ok(()) => {
                    imported += 1;
                    tracing::info!("imported: {}", file_path.display());
                }
                Err(e) => {
                    skipped += 1;
                    tracing::warn!("skipped {}: {e}", file_path.display());
                }
            }
        }

        tracing::info!("import complete: {imported} imported, {skipped} skipped");

        Ok(ImportResult {
            imported,
            skipped,
            total_files,
        })
    }

    #[allow(clippy::too_many_arguments)]
    fn import_single_file(
        &self,
        file_path: &Path,
        source_path: &Path,
        catalog: &Catalog,
        on_progress: &dyn Fn(u32, u32, &str),
        imported: u32,
        skipped: u32,
        total_files: u32,
    ) -> Result<()> {
        // Stream hash computation instead of reading entire file into memory
        let mut hasher = blake3::Hasher::new();
        let file = std::fs::File::open(file_path)
            .with_context(|| format!("opening {}", file_path.display()))?;
        let file_size = file.metadata()?.len() as i64;

        // Hash in 64KB chunks (not loading entire file)
        let mut reader = std::io::BufReader::with_capacity(65536, file);
        std::io::copy(&mut reader, &mut hasher)?;
        let hash = hasher.finalize();
        let hash_bytes = hash.as_bytes().to_vec();

        let (width, height) =
            charmera_core::thumbnails::get_image_dimensions(file_path).unwrap_or((0, 0));

        let thumb_result = charmera_core::thumbnails::generate_thumbnail(
            file_path,
            &self.thumbnail_dir,
            &hash_bytes,
        );
        let thumb_path = thumb_result.ok().map(|p| p.display().to_string());

        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Copy photo to local storage using fs::copy (kernel-level, no memory buffer)
        let hash_hex = hash_bytes
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>();
        let local_dir = self.photos_dir().join(&hash_hex[..2]);
        let _ = std::fs::create_dir_all(&local_dir);
        let local_path = local_dir.join(&file_name);
        if !local_path.exists() {
            std::fs::copy(file_path, &local_path)
                .with_context(|| format!("copying to {}", local_path.display()))?;
        }
        let stored_path = local_path.display().to_string();

        let relative = file_path
            .strip_prefix(source_path)
            .unwrap_or(file_path)
            .display()
            .to_string();

        let exif = charmera_core::import::extract_exif(file_path);

        on_progress(imported + skipped + 1, total_files, &file_name);

        let photo = PhotoInsert {
            file_path: stored_path,
            relative_path: relative,
            watched_folder_id: None,
            file_hash: hash_bytes,
            file_size,
            width,
            height,
            taken_at: exif.taken_at,
            camera_make: exif.camera_make,
            camera_model: exif
                .camera_model
                .or_else(|| Some("KODAK CHARMERA".to_string())),
            source_device: Some("KODAK CHARMERA".to_string()),
            original_name: Some(file_name),
            thumbnail_path: thumb_path,
        };

        catalog.write(WriteOp::InsertPhoto(photo))
    }

    pub fn catalog_lock(&self) -> Result<std::sync::MutexGuard<'_, Catalog>> {
        self.catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))
    }

    /// Get photos imported within the last N hours.
    pub fn get_recent_photos(&self, hours: u32) -> Result<PhotoPage> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut stmt = catalog.read_conn().prepare(
            "SELECT id, relative_path, thumbnail_path, width, height, taken_at, rating
             FROM photos
             WHERE is_hidden = 0
               AND imported_at >= datetime('now', ?1)
             ORDER BY imported_at DESC
             LIMIT 200",
        )?;
        let interval = format!("-{hours} hours");
        let photos: Vec<charmera_core::catalog::PhotoSummary> = stmt
            .query_map([&interval], |row| {
                Ok(charmera_core::catalog::PhotoSummary {
                    id: row.get(0)?,
                    relative_path: row.get(1)?,
                    thumbnail_path: row.get(2)?,
                    width: row.get(3)?,
                    height: row.get(4)?,
                    taken_at: row.get(5)?,
                    rating: row.get::<_, Option<u8>>(6)?.unwrap_or(0),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("reading rows from the catalog")?;
        let total = photos.len() as u32;
        Ok(PhotoPage { photos, total })
    }

    pub fn get_photos(&self, offset: u32, limit: u32) -> Result<PhotoPage> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let (photos, total) = catalog.get_photos(offset, limit, false)?;
        Ok(PhotoPage { photos, total })
    }

    /// Get the best available image path for a photo.
    /// Tries original file first, falls back to thumbnail if original is unavailable.
    pub fn get_photo_file_path(&self, id: i64) -> Result<String> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let (file_path, thumb_path): (String, Option<String>) = catalog.read_conn().query_row(
            "SELECT file_path, thumbnail_path FROM photos WHERE id = ?1",
            [id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        // Use original if it exists on disk, otherwise fall back to thumbnail
        if std::path::Path::new(&file_path).exists() {
            Ok(file_path)
        } else if let Some(tp) = thumb_path {
            if std::path::Path::new(&tp).exists() {
                Ok(tp)
            } else {
                anyhow::bail!("photo file not found: {file_path}")
            }
        } else {
            anyhow::bail!("photo file not found: {file_path}")
        }
    }

    pub fn export_photo(&self, id: i64, dest: &str) -> Result<String> {
        let file_path = self.get_photo_file_path(id)?;
        let img = charmera_core::imageio::open_limited(Path::new(&file_path))?;
        let dest_path = std::path::PathBuf::from(dest);
        charmera_core::export::export_photo(&img, &dest_path, None)?;
        Ok(dest_path.display().to_string())
    }

    /// Get unlabeled photos for auto-labeling.
    /// Photos still needing an AI description.
    ///
    /// Bounded: labeling runs at roughly a second per photo, so a run is
    /// measured in hours long before memory matters — but an unbounded
    /// `SELECT` on a very large library would still materialize every row up
    /// front. Callers re-run to pick up the remainder, and `auto_label_all`
    /// reports when more are waiting.
    pub const UNLABELED_BATCH_LIMIT: u32 = 5_000;

    pub fn get_unlabeled_photos(&self) -> Result<Vec<(i64, String, Option<String>)>> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut stmt = catalog.read_conn().prepare(
            "SELECT id, file_path, thumbnail_path FROM photos
             WHERE (description IS NULL OR description = '') AND is_hidden = 0
             ORDER BY id
             LIMIT ?1",
        )?;
        let photos = stmt
            .query_map([Self::UNLABELED_BATCH_LIMIT], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("reading unlabeled photos from the catalog")?;
        Ok(photos)
    }

    /// How many photos still have no AI description.
    pub fn count_unlabeled_photos(&self) -> Result<u32> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let count: i64 = catalog.read_conn().query_row(
            "SELECT COUNT(*) FROM photos
             WHERE (description IS NULL OR description = '') AND is_hidden = 0",
            [],
            |row| row.get(0),
        )?;
        Ok(count.max(0) as u32)
    }

    /// Store a single photo's AI label results.
    pub fn store_label(&self, id: i64, label: &charmera_core::ai::PhotoLabel) -> Result<()> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;

        catalog.write(charmera_core::catalog::WriteOp::UpdatePhotoDescription(
            id,
            label.description.clone(),
        ))?;

        let tag_assignments: Vec<charmera_core::catalog::TagAssignment> = label
            .tags
            .iter()
            .map(|t| charmera_core::catalog::TagAssignment {
                tag_name: t.clone(),
                confidence: Some(0.8),
                source: "ai".to_string(),
                category: None,
            })
            .collect();
        catalog.write(charmera_core::catalog::WriteOp::UpdatePhotoTags(
            id,
            tag_assignments,
        ))?;

        Ok(())
    }

    /// Get rename proposals based on AI descriptions and naming pattern.
    pub fn get_rename_proposals(&self) -> Result<Vec<RenameProposal>> {
        // Read naming pattern before locking catalog to avoid deadlock
        let pattern = self
            .get_setting("naming_pattern")?
            .unwrap_or_else(|| charmera_core::constants::DEFAULT_NAMING_PATTERN.to_string());

        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut stmt = catalog.read_conn().prepare(
            "SELECT id, file_path, original_name, description, thumbnail_path, taken_at
             FROM photos
             WHERE description IS NOT NULL AND description != '' AND is_hidden = 0",
        )?;

        let mut counter = 1u32;
        let proposals = stmt
            .query_map([], |row| {
                let id: i64 = row.get(0)?;
                let file_path: String = row.get(1)?;
                let _original_name: Option<String> = row.get(2)?;
                let description: String = row.get(3)?;
                let thumbnail_path: Option<String> = row.get(4)?;
                let taken_at: Option<String> = row.get(5)?;

                let (current_name, ext, orig_stem) = {
                    let path = std::path::Path::new(&file_path);
                    let name = path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let e = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("jpg")
                        .to_string();
                    let stem = path
                        .file_stem()
                        .and_then(|n| n.to_str())
                        .unwrap_or("photo")
                        .to_string();
                    (name, e, stem)
                };

                Ok((
                    id,
                    file_path,
                    current_name,
                    description,
                    thumbnail_path,
                    taken_at,
                    ext,
                    orig_stem,
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("reading photos to build rename proposals")?
            .into_iter()
            .map(
                |(
                    id,
                    file_path,
                    current_name,
                    description,
                    thumbnail_path,
                    taken_at,
                    ext,
                    orig_stem,
                )| {
                    let proposed = charmera_core::import::apply_naming_pattern(
                        &pattern,
                        taken_at.as_deref(),
                        &description,
                        counter,
                        &orig_stem,
                    );
                    counter += 1;

                    let proposed_name = if proposed.is_empty() {
                        current_name.clone()
                    } else {
                        format!("{proposed}.{ext}")
                    };

                    RenameProposal {
                        id,
                        current_name,
                        proposed_name,
                        description,
                        file_path,
                        thumbnail_path,
                    }
                },
            )
            .filter(|p| p.current_name != p.proposed_name)
            .collect();
        Ok(proposals)
    }

    /// Apply approved renames.
    ///
    /// Returns `(renamed, skipped)`. Skips are not failures — a file may have
    /// moved, the target name may already be taken, or the name may be unsafe —
    /// but the caller must report them so the user isn't told "renamed 10" when
    /// only 7 files actually changed.
    pub fn apply_renames(&self, renames: &[(i64, String)]) -> Result<RenameOutcome> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut count = 0u32;
        let mut skipped = 0u32;

        for (id, new_name) in renames {
            let file_path: String = catalog.read_conn().query_row(
                "SELECT file_path FROM photos WHERE id = ?1",
                [id],
                |row| row.get(0),
            )?;

            let path = std::path::Path::new(&file_path);
            if !path.exists() {
                tracing::warn!("skipping rename for {id}: file not found");
                skipped += 1;
                continue;
            }

            // The rename dialog lets the user edit filenames freely, so `new_name`
            // is untrusted input. Without this guard an absolute path or `..`
            // segment would make `with_file_name` place the file anywhere on
            // disk (e.g. ~/Library/LaunchAgents) instead of beside the original.
            if let Err(reason) = validate_rename_target(new_name) {
                tracing::warn!("skipping rename for {id}: {reason}");
                skipped += 1;
                continue;
            }

            let new_path = path.with_file_name(new_name);
            if new_path.parent() != path.parent() {
                tracing::warn!("skipping rename for {id}: target escapes source directory");
                skipped += 1;
                continue;
            }
            if new_path.exists() {
                tracing::warn!(
                    "skipping rename for {id}: target exists: {}",
                    new_path.display()
                );
                skipped += 1;
                continue;
            }

            std::fs::rename(path, &new_path).with_context(|| {
                format!("renaming {} -> {}", path.display(), new_path.display())
            })?;

            // Update catalog — both file_path and relative_path so the UI shows the new name
            catalog.write(charmera_core::catalog::WriteOp::Custom(Box::new({
                let new_path_str = new_path.display().to_string();
                let new_name = new_name.clone();
                let id = *id;
                move |conn| {
                    conn.execute(
                        "UPDATE photos SET file_path = ?1, relative_path = ?2 WHERE id = ?3",
                        rusqlite::params![new_path_str, new_name, id],
                    )?;
                    Ok(())
                }
            })))?;

            count += 1;
            tracing::info!("renamed: {} -> {}", file_path, new_path.display());
        }

        Ok(RenameOutcome {
            renamed: count,
            skipped,
        })
    }

    pub fn get_all_tags(&self) -> Result<Vec<charmera_core::catalog::TagInfo>> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        catalog.get_all_tags()
    }

    pub fn search_by_tag(&self, tag: &str) -> Result<PhotoPage> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut stmt = catalog.read_conn().prepare(
            "SELECT DISTINCT p.id, p.relative_path, p.thumbnail_path,
                    p.width, p.height, p.taken_at, p.rating
             FROM photos p
             JOIN photo_tags pt ON p.id = pt.photo_id
             JOIN tags t ON pt.tag_id = t.id
             WHERE t.name = ?1 AND p.is_hidden = 0
             ORDER BY p.taken_at DESC NULLS LAST
             LIMIT 200",
        )?;
        let photos: Vec<charmera_core::catalog::PhotoSummary> = stmt
            .query_map([tag], |row| {
                Ok(charmera_core::catalog::PhotoSummary {
                    id: row.get(0)?,
                    relative_path: row.get(1)?,
                    thumbnail_path: row.get(2)?,
                    width: row.get(3)?,
                    height: row.get(4)?,
                    taken_at: row.get(5)?,
                    rating: row.get::<_, Option<u8>>(6)?.unwrap_or(0),
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("reading rows from the catalog")?;
        let total = photos.len() as u32;
        Ok(PhotoPage { photos, total })
    }

    pub fn search_photos(&self, query: &str) -> Result<PhotoPage> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let photos = catalog.search_text(query, 100)?;
        let total = photos.len() as u32;
        Ok(PhotoPage { photos, total })
    }

    /// Find groups of duplicate photos by file hash.
    pub fn get_duplicates(&self) -> Result<Vec<DuplicateGroup>> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;

        // Find hashes that appear more than once
        let mut hash_stmt = catalog.read_conn().prepare(
            "SELECT file_hash, COUNT(*) as cnt FROM photos
             WHERE is_hidden = 0
             GROUP BY file_hash
             HAVING cnt > 1
             ORDER BY cnt DESC
             LIMIT 100",
        )?;

        let hashes: Vec<Vec<u8>> = hash_stmt
            .query_map([], |row| row.get::<_, Vec<u8>>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("reading duplicate hash groups")?;

        if hashes.is_empty() {
            return Ok(Vec::new());
        }

        // One query for every duplicate group instead of preparing and running
        // a statement per group (up to 100 round-trips on the UI path).
        let placeholders = std::iter::repeat_n("?", hashes.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT file_hash, id, relative_path, thumbnail_path, width, height, taken_at, rating
             FROM photos
             WHERE is_hidden = 0 AND file_hash IN ({placeholders})"
        );
        let mut photo_stmt = catalog.read_conn().prepare(&sql)?;

        let params = rusqlite::params_from_iter(hashes.iter());
        let rows = photo_stmt
            .query_map(params, |row| {
                Ok((
                    row.get::<_, Vec<u8>>(0)?,
                    PhotoSummary {
                        id: row.get(1)?,
                        relative_path: row.get(2)?,
                        thumbnail_path: row.get(3)?,
                        width: row.get(4)?,
                        height: row.get(5)?,
                        taken_at: row.get(6)?,
                        rating: row.get::<_, Option<u8>>(7)?.unwrap_or(0),
                    },
                ))
            })?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("reading photos in duplicate groups")?;

        let mut by_hash: std::collections::HashMap<Vec<u8>, Vec<PhotoSummary>> =
            std::collections::HashMap::new();
        for (hash, photo) in rows {
            by_hash.entry(hash).or_default().push(photo);
        }

        // Preserve the "most duplicated first" order from the grouping query.
        let groups = hashes
            .into_iter()
            .filter_map(|hash| {
                let photos = by_hash.remove(&hash)?;
                let hash_hex = hash.iter().map(|b| format!("{b:02x}")).collect::<String>();
                Some(DuplicateGroup { hash_hex, photos })
            })
            .collect();

        Ok(groups)
    }

    pub fn get_photo_labels(&self, id: i64) -> Result<PhotoLabels> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;

        let description: Option<String> = catalog.read_conn().query_row(
            "SELECT description FROM photos WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;

        let mut stmt = catalog.read_conn().prepare(
            "SELECT t.name FROM tags t
             JOIN photo_tags pt ON t.id = pt.tag_id
             WHERE pt.photo_id = ?1
             ORDER BY pt.confidence DESC",
        )?;
        let tags: Vec<String> = stmt
            .query_map([id], |row| row.get(0))?
            .collect::<std::result::Result<Vec<_>, _>>()
            .context("reading rows from the catalog")?;

        Ok(PhotoLabels { description, tags })
    }
}

/// Reject rename targets that are anything other than a plain filename.
///
/// `Path::with_file_name` replaces the final component, so an absolute path or
/// one containing separators silently relocates the file instead of renaming
/// it in place. Names come from a freely-editable text field in the rename
/// dialog, so they are untrusted.
fn validate_rename_target(name: &str) -> std::result::Result<(), String> {
    if name.trim().is_empty() {
        return Err("empty filename".into());
    }
    if name.contains('/') || name.contains('\\') {
        return Err(format!("filename contains a path separator: {name:?}"));
    }
    if name.contains('\0') {
        return Err("filename contains a null byte".into());
    }
    if name == "." || name == ".." {
        return Err(format!("filename is a directory reference: {name:?}"));
    }
    if Path::new(name).is_absolute() {
        return Err(format!("filename is an absolute path: {name:?}"));
    }
    // Guards against Windows drive-relative forms like `C:evil.jpg`, which are
    // not caught by `is_absolute` on unix.
    if Path::new(name).components().count() != 1 {
        return Err(format!("filename is not a single path component: {name:?}"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rename_target_accepts_plain_names() {
        assert!(validate_rename_target("b 03-30-2026 brown dog.jpg").is_ok());
        assert!(validate_rename_target("PICT0001.jpg").is_ok());
        assert!(validate_rename_target("café au lait.jpg").is_ok());
    }

    #[test]
    fn rename_target_rejects_absolute_paths() {
        assert!(validate_rename_target("/etc/passwd").is_err());
        assert!(validate_rename_target("/tmp/evil.jpg").is_err());
    }

    #[test]
    fn rename_target_rejects_traversal() {
        assert!(validate_rename_target("../../../.ssh/authorized_keys").is_err());
        assert!(validate_rename_target("..").is_err());
        assert!(validate_rename_target(".").is_err());
        assert!(validate_rename_target("sub/dir.jpg").is_err());
        assert!(validate_rename_target("sub\\dir.jpg").is_err());
    }

    #[test]
    fn rename_target_rejects_empty_and_null() {
        assert!(validate_rename_target("").is_err());
        assert!(validate_rename_target("   ").is_err());
        assert!(validate_rename_target("evil\0.jpg").is_err());
    }
}
