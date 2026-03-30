mod schema;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use rusqlite::Connection;
use tokio::sync::mpsc;

pub use schema::MIGRATIONS;

/// A write operation sent to the single database writer task.
pub enum WriteOp {
    InsertPhoto(PhotoInsert),
    UpdatePhotoTags(i64, Vec<TagAssignment>),
    UpdatePhotoEmbedding(i64, Vec<f32>),
    UpdatePhotoDescription(i64, String),
    UpdatePhotoThumbnail(i64, String),
    InsertTag(String, String, String),
    CreateAlbum(String, Option<String>),
    AddPhotoToAlbum(i64, i64),
    SaveEdit(i64, String, Option<String>),
    SetPhotoRating(i64, u8),
    HidePhoto(i64),
    UnhidePhoto(i64),
    Custom(Box<dyn FnOnce(&Connection) -> Result<()> + Send>),
}

#[derive(Debug, Clone)]
pub struct PhotoInsert {
    pub file_path: String,
    pub relative_path: String,
    pub watched_folder_id: Option<i64>,
    pub file_hash: Vec<u8>,
    pub file_size: i64,
    pub width: u32,
    pub height: u32,
    pub taken_at: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub source_device: Option<String>,
    pub original_name: Option<String>,
    pub thumbnail_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TagAssignment {
    pub tag_name: String,
    pub confidence: Option<f64>,
    pub source: String,
    pub category: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PhotoSummary {
    pub id: i64,
    pub relative_path: String,
    pub thumbnail_path: Option<String>,
    pub width: u32,
    pub height: u32,
    pub taken_at: Option<String>,
    pub rating: u8,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PhotoDetail {
    pub id: i64,
    pub file_path: String,
    pub relative_path: String,
    pub file_size: i64,
    pub width: u32,
    pub height: u32,
    pub taken_at: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub description: Option<String>,
    pub rating: u8,
    pub source_device: Option<String>,
    pub original_name: Option<String>,
    pub tags: Vec<TagInfo>,
    pub edits: Vec<EditInfo>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TagInfo {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
    pub source: String,
    pub category: Option<String>,
    pub count: i64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct EditInfo {
    pub id: i64,
    pub name: String,
    pub edit_stack: String,
    pub frame: Option<String>,
    pub is_active: bool,
}

/// Database handle. Reads happen directly; writes go through the writer channel.
pub struct Catalog {
    /// Read-only connection for queries.
    read_conn: Connection,
    /// Channel to send writes to the single writer task.
    write_tx: mpsc::Sender<WriteOp>,
    /// Path to the database file.
    db_path: PathBuf,
}

impl Catalog {
    /// Open or create a catalog database at the given path.
    pub fn open(db_path: &Path) -> Result<Self> {
        // Ensure parent directory exists
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("creating catalog directory: {}", parent.display()))?;
        }

        // Writer connection (owned by the writer task)
        let mut write_conn = Connection::open(db_path)
            .with_context(|| format!("opening catalog: {}", db_path.display()))?;
        Self::configure_connection(&write_conn)?;
        schema::run_migrations(&mut write_conn)?;

        // Read connection
        let read_conn = Connection::open(db_path)?;
        Self::configure_connection(&read_conn)?;

        // Spawn writer task
        let (write_tx, mut write_rx) = mpsc::channel::<WriteOp>(256);

        std::thread::spawn(move || {
            while let Some(op) = write_rx.blocking_recv() {
                if let Err(e) = Self::execute_write(&write_conn, op) {
                    tracing::error!("catalog write error: {e:#}");
                }
            }
        });

        Ok(Self {
            read_conn,
            write_tx,
            db_path: db_path.to_owned(),
        })
    }

    fn configure_connection(conn: &Connection) -> Result<()> {
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        conn.pragma_update(None, "busy_timeout", "5000")?;
        Ok(())
    }

    fn execute_write(conn: &Connection, op: WriteOp) -> Result<()> {
        match op {
            WriteOp::InsertPhoto(photo) => {
                conn.execute(
                    "INSERT OR IGNORE INTO photos (
                        file_path, relative_path, watched_folder_id, file_hash,
                        file_size, width, height, taken_at, camera_make,
                        camera_model, source_device, original_name, thumbnail_path
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    rusqlite::params![
                        photo.file_path,
                        photo.relative_path,
                        photo.watched_folder_id,
                        photo.file_hash,
                        photo.file_size,
                        photo.width,
                        photo.height,
                        photo.taken_at,
                        photo.camera_make,
                        photo.camera_model,
                        photo.source_device,
                        photo.original_name,
                        photo.thumbnail_path,
                    ],
                )?;
                Ok(())
            }
            WriteOp::UpdatePhotoThumbnail(id, path) => {
                conn.execute(
                    "UPDATE photos SET thumbnail_path = ?1 WHERE id = ?2",
                    rusqlite::params![path, id],
                )?;
                Ok(())
            }
            WriteOp::UpdatePhotoEmbedding(id, embedding) => {
                let bytes: Vec<u8> = embedding
                    .iter()
                    .flat_map(|f| f.to_le_bytes())
                    .collect();
                conn.execute(
                    "UPDATE photos SET embedding = ?1 WHERE id = ?2",
                    rusqlite::params![bytes, id],
                )?;
                Ok(())
            }
            WriteOp::UpdatePhotoDescription(id, desc) => {
                conn.execute(
                    "UPDATE photos SET description = ?1 WHERE id = ?2",
                    rusqlite::params![desc, id],
                )?;
                Ok(())
            }
            WriteOp::UpdatePhotoTags(photo_id, tags) => {
                for tag in tags {
                    conn.execute(
                        "INSERT OR IGNORE INTO tags (name, source, category) VALUES (?1, ?2, ?3)",
                        rusqlite::params![tag.tag_name, tag.source, tag.category],
                    )?;
                    let tag_id: i64 = conn.query_row(
                        "SELECT id FROM tags WHERE name = ?1",
                        [&tag.tag_name],
                        |row| row.get(0),
                    )?;
                    conn.execute(
                        "INSERT OR REPLACE INTO photo_tags (photo_id, tag_id, confidence)
                         VALUES (?1, ?2, ?3)",
                        rusqlite::params![photo_id, tag_id, tag.confidence],
                    )?;
                }
                Ok(())
            }
            WriteOp::InsertTag(name, source, category) => {
                conn.execute(
                    "INSERT OR IGNORE INTO tags (name, source, category) VALUES (?1, ?2, ?3)",
                    rusqlite::params![name, source, category],
                )?;
                Ok(())
            }
            WriteOp::CreateAlbum(name, description) => {
                conn.execute(
                    "INSERT INTO albums (name, description) VALUES (?1, ?2)",
                    rusqlite::params![name, description],
                )?;
                Ok(())
            }
            WriteOp::AddPhotoToAlbum(album_id, photo_id) => {
                conn.execute(
                    "INSERT OR IGNORE INTO album_photos (album_id, photo_id) VALUES (?1, ?2)",
                    rusqlite::params![album_id, photo_id],
                )?;
                Ok(())
            }
            WriteOp::SaveEdit(photo_id, edit_stack, frame) => {
                // Deactivate previous edits
                conn.execute(
                    "UPDATE edits SET is_active = 0 WHERE photo_id = ?1",
                    [photo_id],
                )?;
                conn.execute(
                    "INSERT INTO edits (photo_id, edit_stack, frame) VALUES (?1, ?2, ?3)",
                    rusqlite::params![photo_id, edit_stack, frame],
                )?;
                Ok(())
            }
            WriteOp::SetPhotoRating(id, rating) => {
                conn.execute(
                    "UPDATE photos SET rating = ?1 WHERE id = ?2",
                    rusqlite::params![rating.min(5), id],
                )?;
                Ok(())
            }
            WriteOp::HidePhoto(id) => {
                conn.execute("UPDATE photos SET is_hidden = 1 WHERE id = ?1", [id])?;
                Ok(())
            }
            WriteOp::UnhidePhoto(id) => {
                conn.execute("UPDATE photos SET is_hidden = 0 WHERE id = ?1", [id])?;
                Ok(())
            }
            WriteOp::Custom(f) => f(conn),
        }
    }

    /// Send a write operation (async, non-blocking).
    pub async fn write_async(&self, op: WriteOp) -> Result<()> {
        self.write_tx
            .send(op)
            .await
            .map_err(|_| anyhow::anyhow!("catalog writer task has shut down"))
    }

    /// Send a write operation (blocking).
    pub fn write(&self, op: WriteOp) -> Result<()> {
        self.write_tx
            .blocking_send(op)
            .map_err(|_| anyhow::anyhow!("catalog writer task has shut down"))
    }

    /// Access the read connection directly for custom queries.
    pub fn read_conn(&self) -> &Connection {
        &self.read_conn
    }

    /// Get paginated photos for the grid view.
    pub fn get_photos(
        &self,
        offset: u32,
        limit: u32,
        hidden: bool,
    ) -> Result<(Vec<PhotoSummary>, u32)> {
        let total: u32 = self.read_conn.query_row(
            "SELECT COUNT(*) FROM photos WHERE is_hidden = ?1",
            [hidden as i32],
            |row| row.get(0),
        )?;

        let mut stmt = self.read_conn.prepare(
            "SELECT id, relative_path, thumbnail_path, width, height, taken_at, rating
             FROM photos WHERE is_hidden = ?1
             ORDER BY taken_at DESC NULLS LAST, id DESC
             LIMIT ?2 OFFSET ?3",
        )?;

        let photos = stmt
            .query_map(rusqlite::params![hidden as i32, limit, offset], |row| {
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
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok((photos, total))
    }

    /// Search by text (FTS5 on tags and filenames).
    pub fn search_text(&self, query: &str, limit: u32) -> Result<Vec<PhotoSummary>> {
        let pattern = format!("%{query}%");
        let mut stmt = self.read_conn.prepare(
            "SELECT DISTINCT p.id, p.relative_path, p.thumbnail_path,
                    p.width, p.height, p.taken_at, p.rating
             FROM photos p
             LEFT JOIN photo_tags pt ON p.id = pt.photo_id
             LEFT JOIN tags t ON pt.tag_id = t.id
             WHERE (t.name LIKE ?1 OR p.relative_path LIKE ?1 OR p.description LIKE ?1)
               AND p.is_hidden = 0
             ORDER BY p.taken_at DESC NULLS LAST
             LIMIT ?2",
        )?;

        let photos = stmt
            .query_map(rusqlite::params![pattern, limit], |row| {
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
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(photos)
    }

    /// Get all tags with photo counts.
    pub fn get_all_tags(&self) -> Result<Vec<TagInfo>> {
        let mut stmt = self.read_conn.prepare(
            "SELECT t.id, t.name, t.color, t.source, t.category,
                    COUNT(pt.photo_id) as cnt
             FROM tags t
             LEFT JOIN photo_tags pt ON t.id = pt.tag_id
             GROUP BY t.id
             ORDER BY cnt DESC",
        )?;

        let tags = stmt
            .query_map([], |row| {
                Ok(TagInfo {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    source: row.get(3)?,
                    category: row.get(4)?,
                    count: row.get(5)?,
                })
            })?
            .collect::<std::result::Result<Vec<_>, _>>()?;

        Ok(tags)
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }
}
