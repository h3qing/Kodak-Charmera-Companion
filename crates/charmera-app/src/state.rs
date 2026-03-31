use std::path::{Path, PathBuf};
use std::sync::Mutex;

use anyhow::{Context, Result};
use charmera_core::catalog::{Catalog, PhotoDetail, PhotoInsert, PhotoSummary};
use charmera_core::catalog::WriteOp;
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
}

#[derive(Serialize)]
pub struct LabelResult {
    pub labeled: u32,
    pub failed: u32,
    pub total: u32,
}

#[derive(Serialize)]
pub struct PhotoLabels {
    pub description: Option<String>,
    pub tags: Vec<String>,
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

    pub fn import_from_path(&self, source: &str) -> Result<ImportResult> {
        let source_path = PathBuf::from(source);
        let files = charmera_core::import::list_media_files(&source_path)?;
        let total_files = files.len() as u32;
        let mut imported = 0u32;
        let mut skipped = 0u32;

        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;

        for file_path in &files {
            let ext = file_path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");
            if !matches!(ext.to_lowercase().as_str(), "jpg" | "jpeg") {
                skipped += 1;
                continue;
            }

            let file_bytes = std::fs::read(file_path)
                .with_context(|| format!("reading {}", file_path.display()))?;
            let hash = blake3::hash(&file_bytes);
            let hash_bytes = hash.as_bytes().to_vec();

            let (width, height) = charmera_core::thumbnails::get_image_dimensions(file_path)
                .unwrap_or((0, 0));

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

            let relative = file_path
                .strip_prefix(&source_path)
                .unwrap_or(file_path)
                .display()
                .to_string();

            let photo = PhotoInsert {
                file_path: file_path.display().to_string(),
                relative_path: relative,
                watched_folder_id: None,
                file_hash: hash_bytes,
                file_size,
                width,
                height,
                taken_at: None,
                camera_make: None,
                camera_model: Some("KODAK CHARMERA".to_string()),
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
        Ok(ImportResult { imported, skipped, total_files })
    }

    pub fn get_photos(&self, offset: u32, limit: u32) -> Result<PhotoPage> {
        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let (photos, total) = catalog.get_photos(offset, limit, false)?;
        Ok(PhotoPage { photos, total })
    }

    /// Get the best available image path for a photo.
    /// Tries original file first, falls back to thumbnail if original is unavailable.
    pub fn get_photo_file_path(&self, id: i64) -> Result<String> {
        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;
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
        let img = image::open(&file_path)
            .with_context(|| format!("opening {file_path}"))?;

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

    pub fn auto_label_all(&self) -> Result<LabelResult> {
        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;

        // Get all photos that don't have descriptions yet
        let mut stmt = catalog.read_conn().prepare(
            "SELECT id, thumbnail_path FROM photos WHERE description IS NULL AND is_hidden = 0",
        )?;
        let photos: Vec<(i64, Option<String>)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .filter_map(|r| r.ok())
            .collect();

        let total = photos.len() as u32;
        let mut labeled = 0u32;
        let mut failed = 0u32;

        for (id, thumb_path) in &photos {
            let image_path = thumb_path.as_deref().unwrap_or("");
            if image_path.is_empty() {
                failed += 1;
                continue;
            }

            tracing::info!("labeling photo {id}...");
            match charmera_core::ai::label_photo(std::path::Path::new(image_path)) {
                Ok(label) => {
                    // Store description
                    catalog.write(charmera_core::catalog::WriteOp::UpdatePhotoDescription(
                        *id,
                        label.description.clone(),
                    ))?;

                    // Store tags
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
                        *id,
                        tag_assignments,
                    ))?;

                    labeled += 1;
                    tracing::info!("  -> {}: {}", id, label.description);
                }
                Err(e) => {
                    tracing::warn!("  -> failed to label photo {id}: {e}");
                    failed += 1;
                }
            }
        }

        // Give writer time to flush
        std::thread::sleep(std::time::Duration::from_millis(200));
        tracing::info!("labeling complete: {labeled} labeled, {failed} failed, {total} total");
        Ok(LabelResult { labeled, failed, total })
    }

    pub fn get_all_tags(&self) -> Result<Vec<charmera_core::catalog::TagInfo>> {
        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        catalog.get_all_tags()
    }

    pub fn search_by_tag(&self, tag: &str) -> Result<PhotoPage> {
        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;
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
        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;
        let photos = catalog.search_text(query, 100)?;
        let total = photos.len() as u32;
        Ok(PhotoPage { photos, total })
    }

    pub fn get_photo_labels(&self, id: i64) -> Result<PhotoLabels> {
        let catalog = self.catalog.lock().map_err(|e| anyhow::anyhow!("lock: {e}"))?;

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
