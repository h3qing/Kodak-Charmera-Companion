use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result};
use charmera_core::catalog::WriteOp;
use charmera_core::catalog::{Catalog, PhotoInsert, PhotoSummary};
use serde::Serialize;

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

    pub fn import_from_path(&self, source: &str) -> Result<ImportResult> {
        self.import_from_path_with_progress(source, &|_, _, _| {})
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
            if !matches!(ext.to_lowercase().as_str(), "jpg" | "jpeg") {
                skipped += 1;
                continue;
            }

            let file_bytes = std::fs::read(file_path)
                .with_context(|| format!("reading {}", file_path.display()))?;
            let hash = blake3::hash(&file_bytes);
            let hash_bytes = hash.as_bytes().to_vec();

            let (width, height) =
                charmera_core::thumbnails::get_image_dimensions(file_path).unwrap_or((0, 0));

            let thumb_result = charmera_core::thumbnails::generate_thumbnail(
                file_path,
                &self.thumbnail_dir,
                &hash_bytes,
            );
            let thumb_path = thumb_result.ok().map(|p| p.display().to_string());

            let file_size = file_bytes.len() as i64;
            let file_name = file_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            // Copy photo to local storage so it's available after camera disconnect
            let hash_hex = hash_bytes
                .iter()
                .map(|b| format!("{b:02x}"))
                .collect::<String>();
            let local_dir = self.photos_dir().join(&hash_hex[..2]);
            let _ = std::fs::create_dir_all(&local_dir);
            let local_path = local_dir.join(&file_name);
            if !local_path.exists() {
                std::fs::write(&local_path, &file_bytes)
                    .with_context(|| format!("copying to {}", local_path.display()))?;
            }
            let stored_path = local_path.display().to_string();

            let relative = file_path
                .strip_prefix(&source_path)
                .unwrap_or(file_path)
                .display()
                .to_string();

            // Extract EXIF metadata (date taken, camera info)
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

            catalog.write(WriteOp::InsertPhoto(photo))?;
            imported += 1;
            tracing::info!("imported: {}", file_path.display());
        }

        // Give writer task time to process
        std::thread::sleep(std::time::Duration::from_millis(100));
        tracing::info!("import complete: {imported} imported, {skipped} skipped");
        Ok(ImportResult {
            imported,
            skipped,
            total_files,
        })
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
            .filter_map(|r| r.ok())
            .collect();
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

    pub fn preview_effect(
        &self,
        id: i64,
        effects: &[String],
        frame: Option<&str>,
    ) -> Result<String> {
        let file_path = self.get_photo_file_path(id)?;
        let img = image::open(&file_path).with_context(|| format!("opening {file_path}"))?;

        // Resize for preview speed (max 800px on long edge)
        let preview = img.resize(800, 800, image::imageops::FilterType::Triangle);
        let result = charmera_core::effects::apply_pipeline(&preview, effects, frame)?;

        // Encode to JPEG base64
        let mut buf = Vec::new();
        let mut cursor = std::io::Cursor::new(&mut buf);
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, 85);
        result.to_rgb8().write_with_encoder(encoder)?;
        drop(cursor);

        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        Ok(format!("data:image/jpeg;base64,{b64}"))
    }

    pub fn export_photo(
        &self,
        id: i64,
        dest: &str,
        effects: &[String],
        frame: Option<&str>,
    ) -> Result<String> {
        let file_path = self.get_photo_file_path(id)?;
        let img = image::open(&file_path)?;
        let dest_path = std::path::PathBuf::from(dest);
        charmera_core::export::export_photo(&img, &dest_path, effects, frame, None)?;
        Ok(dest_path.display().to_string())
    }

    /// Get unlabeled photos for auto-labeling.
    pub fn get_unlabeled_photos(&self) -> Result<Vec<(i64, String, Option<String>)>> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut stmt = catalog.read_conn().prepare(
            "SELECT id, file_path, thumbnail_path FROM photos
             WHERE (description IS NULL OR description = '') AND is_hidden = 0",
        )?;
        let photos = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
            .filter_map(|r| r.ok())
            .collect();
        Ok(photos)
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
            .unwrap_or_else(|| "b {MM}-{DD}-{YYYY} {content}".to_string());

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
            .filter_map(|r| r.ok())
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
            .collect();
        Ok(proposals)
    }

    /// Apply approved renames.
    pub fn apply_renames(&self, renames: &[(i64, String)]) -> Result<u32> {
        let catalog = self
            .catalog
            .lock()
            .map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let mut count = 0u32;

        for (id, new_name) in renames {
            let file_path: String = catalog.read_conn().query_row(
                "SELECT file_path FROM photos WHERE id = ?1",
                [id],
                |row| row.get(0),
            )?;

            let path = std::path::Path::new(&file_path);
            if !path.exists() {
                tracing::warn!("skipping rename for {id}: file not found");
                continue;
            }

            let new_path = path.with_file_name(new_name);
            if new_path.exists() {
                tracing::warn!(
                    "skipping rename for {id}: target exists: {}",
                    new_path.display()
                );
                continue;
            }

            std::fs::rename(path, &new_path).with_context(|| {
                format!("renaming {} -> {}", path.display(), new_path.display())
            })?;

            // Update catalog
            catalog.write(charmera_core::catalog::WriteOp::Custom(Box::new({
                let new_path_str = new_path.display().to_string();
                let id = *id;
                move |conn| {
                    conn.execute(
                        "UPDATE photos SET file_path = ?1 WHERE id = ?2",
                        rusqlite::params![new_path_str, id],
                    )?;
                    Ok(())
                }
            })))?;

            count += 1;
            tracing::info!("renamed: {} -> {}", file_path, new_path.display());
        }

        std::thread::sleep(std::time::Duration::from_millis(100));
        Ok(count)
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
            .filter_map(|r| r.ok())
            .collect();
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
            .filter_map(|r| r.ok())
            .collect();

        let mut groups = Vec::new();
        for hash in &hashes {
            let mut photo_stmt = catalog.read_conn().prepare(
                "SELECT id, relative_path, thumbnail_path, width, height, taken_at, rating
                 FROM photos WHERE file_hash = ?1 AND is_hidden = 0",
            )?;
            let photos: Vec<PhotoSummary> = photo_stmt
                .query_map([hash], |row| {
                    Ok(PhotoSummary {
                        id: row.get(0)?,
                        relative_path: row.get(1)?,
                        thumbnail_path: row.get(2)?,
                        width: row.get(3)?,
                        height: row.get(4)?,
                        taken_at: row.get(5)?,
                        rating: row.get::<_, Option<u8>>(6)?.unwrap_or(0),
                    })
                })?
                .filter_map(|r| r.ok())
                .collect();

            let hash_hex = hash.iter().map(|b| format!("{b:02x}")).collect::<String>();
            groups.push(DuplicateGroup { hash_hex, photos });
        }

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
            .filter_map(|r| r.ok())
            .collect();

        Ok(PhotoLabels { description, tags })
    }
}
