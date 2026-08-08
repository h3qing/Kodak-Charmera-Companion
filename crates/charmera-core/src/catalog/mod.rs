mod schema;

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use rusqlite::Connection;
use std::sync::mpsc;

pub use schema::MIGRATIONS;

/// A write operation sent to the single database writer thread.
///
/// Only variants the app actually constructs live here. Speculative ones
/// (albums, ratings, embeddings, thumbnail updates) were removed — they were
/// unreachable code carrying SQL that had never been executed, so it could
/// not be trusted if it were ever wired up. `Custom` covers one-off writes.
pub enum WriteOp {
    InsertPhoto(PhotoInsert),
    UpdatePhotoTags(i64, Vec<TagAssignment>),
    UpdatePhotoDescription(i64, String),
    HidePhoto(i64),
    SetSetting(String, String),
    Custom(CustomWrite),
}

/// A one-off write closure handed to the catalog writer thread.
pub type CustomWrite = Box<dyn FnOnce(&Connection) -> Result<()> + Send>;

/// Escape SQL `LIKE` wildcards in a user-supplied search term.
///
/// Without this, `%` and `_` typed by the user are treated as wildcards: a
/// search for "100%" silently matches every photo, and "a_b" matches "axb".
/// Pair with `ESCAPE '\'` in the query.
fn escape_like(query: &str) -> String {
    let mut out = String::with_capacity(query.len());
    for ch in query.chars() {
        if matches!(ch, '\\' | '%' | '_') {
            out.push('\\');
        }
        out.push(ch);
    }
    out
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

/// A write plus the channel used to report whether it actually landed.
struct WriteRequest {
    op: WriteOp,
    ack: mpsc::SyncSender<Result<(), String>>,
}

/// Database handle. Reads happen directly; writes go through the writer thread.
pub struct Catalog {
    /// Read-only connection for queries.
    read_conn: Connection,
    /// Channel to send writes to the single writer thread.
    write_tx: Option<mpsc::Sender<WriteRequest>>,
    /// Joined on drop so queued writes are not lost when the app quits.
    writer: Option<std::thread::JoinHandle<()>>,
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

        // Single writer thread: SQLite allows one writer, and serializing here
        // keeps every caller off the write lock.
        let (write_tx, write_rx) = mpsc::channel::<WriteRequest>();

        let writer = std::thread::Builder::new()
            .name("charmera-catalog-writer".into())
            .spawn(move || {
                for req in write_rx {
                    let result = Self::execute_write(&write_conn, req.op);
                    if let Err(e) = &result {
                        tracing::error!("catalog write error: {e:#}");
                    }
                    // The receiver is gone if the caller stopped waiting; that's
                    // not our problem, and it must not kill the writer thread.
                    let _ = req.ack.send(result.map_err(|e| format!("{e:#}")));
                }
            })
            .context("spawning catalog writer thread")?;

        Ok(Self {
            read_conn,
            write_tx: Some(write_tx),
            writer: Some(writer),
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
            WriteOp::HidePhoto(id) => {
                conn.execute("UPDATE photos SET is_hidden = 1 WHERE id = ?1", [id])?;
                Ok(())
            }
            WriteOp::SetSetting(key, value) => {
                conn.execute(
                    "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
                    rusqlite::params![key, value],
                )?;
                Ok(())
            }
            WriteOp::Custom(f) => f(conn),
        }
    }

    /// Run a write operation, blocking until the database confirms it.
    ///
    /// This used to return `Ok` as soon as the op was *queued*, so a failing
    /// insert was invisible to the caller: an import could report "imported 100"
    /// while every row silently failed, and callers papered over the race with
    /// `thread::sleep(100ms)`. Waiting for the acknowledgement makes the return
    /// value mean what it says and removes the need for those sleeps.
    pub fn write(&self, op: WriteOp) -> Result<()> {
        // Rendezvous channel: one write, one reply, no buffering.
        let (ack_tx, ack_rx) = mpsc::sync_channel::<Result<(), String>>(0);

        let tx = self
            .write_tx
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("catalog is shutting down"))?;

        tx.send(WriteRequest { op, ack: ack_tx })
            .map_err(|_| anyhow::anyhow!("catalog writer thread has stopped"))?;

        match ack_rx.recv() {
            Ok(Ok(())) => Ok(()),
            Ok(Err(e)) => Err(anyhow::anyhow!(e)),
            Err(_) => Err(anyhow::anyhow!(
                "catalog writer thread stopped before completing the write"
            )),
        }
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
        let pattern = format!("%{}%", escape_like(query));
        let mut stmt = self.read_conn.prepare(
            "SELECT DISTINCT p.id, p.relative_path, p.thumbnail_path,
                    p.width, p.height, p.taken_at, p.rating
             FROM photos p
             LEFT JOIN photo_tags pt ON p.id = pt.photo_id
             LEFT JOIN tags t ON pt.tag_id = t.id
             WHERE (t.name LIKE ?1 ESCAPE '\\'
                 OR p.relative_path LIKE ?1 ESCAPE '\\'
                 OR p.description LIKE ?1 ESCAPE '\\')
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

    /// Get a setting value by key.
    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let result =
            self.read_conn
                .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                    row.get(0)
                });
        match result {
            Ok(val) => Ok(Some(val)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn db_path(&self) -> &Path {
        &self.db_path
    }
}

impl Drop for Catalog {
    /// Close the write channel and wait for the writer thread to drain.
    ///
    /// Without this, quitting the app while writes are still queued loses them
    /// silently — labels and renames the user just made would not be there on
    /// next launch.
    fn drop(&mut self) {
        // Dropping the sender ends the writer's `for req in write_rx` loop once
        // the queue is empty.
        self.write_tx = None;
        if let Some(handle) = self.writer.take()
            && handle.join().is_err()
        {
            tracing::error!("catalog writer thread panicked during shutdown");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    /// Returns the catalog plus the tempdir guard — hold the guard for the
    /// duration of the test so the directory is cleaned up afterwards.
    fn test_catalog() -> (Catalog, tempfile::TempDir) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        (Catalog::open(&db_path).unwrap(), dir)
    }

    #[test]
    fn settings_roundtrip() {
        let (catalog, _dir) = test_catalog();
        assert_eq!(catalog.get_setting("foo").unwrap(), None);

        catalog
            .write(WriteOp::SetSetting("foo".into(), "bar".into()))
            .unwrap();

        // write() only returns once the writer thread has committed, so this
        // is readable immediately — no sleep, no "or it didn't happen" escape
        // hatch. The previous version of this assertion was a tautology that
        // passed whether or not the write ever landed.
        assert_eq!(catalog.get_setting("foo").unwrap(), Some("bar".to_string()));
    }

    #[test]
    fn write_reports_failure_instead_of_silently_dropping_it() {
        let (catalog, _dir) = test_catalog();

        // A write that cannot succeed: the table does not exist.
        let result = catalog.write(WriteOp::Custom(Box::new(|conn| {
            conn.execute("INSERT INTO table_that_does_not_exist VALUES (1)", [])?;
            Ok(())
        })));

        assert!(
            result.is_err(),
            "write() must surface writer-thread errors, not return Ok on enqueue"
        );
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("table_that_does_not_exist"),
            "error should name the real cause, got: {msg}"
        );
    }

    #[test]
    fn writer_survives_a_failed_write() {
        let (catalog, _dir) = test_catalog();

        let _ = catalog.write(WriteOp::Custom(Box::new(|conn| {
            conn.execute("INSERT INTO nope VALUES (1)", [])?;
            Ok(())
        })));

        // One bad write must not poison the writer thread for everything after.
        catalog
            .write(WriteOp::SetSetting("still".into(), "working".into()))
            .unwrap();
        assert_eq!(
            catalog.get_setting("still").unwrap(),
            Some("working".to_string())
        );
    }

    #[test]
    fn insert_photo_and_query() {
        let (catalog, _dir) = test_catalog();
        let photo = PhotoInsert {
            file_path: "/tmp/test.jpg".into(),
            relative_path: "test.jpg".into(),
            watched_folder_id: None,
            file_hash: vec![1, 2, 3, 4],
            file_size: 1024,
            width: 1440,
            height: 1080,
            taken_at: Some("2026-03-30".into()),
            camera_make: None,
            camera_model: Some("KODAK CHARMERA".into()),
            source_device: Some("KODAK CHARMERA".into()),
            original_name: Some("PICT0001.jpg".into()),
            thumbnail_path: None,
        };
        catalog.write(WriteOp::InsertPhoto(photo)).unwrap();

        let (photos, total) = catalog.get_photos(0, 10, false).unwrap();
        assert_eq!(total, 1);
        assert_eq!(photos[0].relative_path, "test.jpg");
        assert_eq!(photos[0].width, 1440);
    }

    #[test]
    fn get_photos_empty() {
        let (catalog, _dir) = test_catalog();
        let (photos, total) = catalog.get_photos(0, 10, false).unwrap();
        assert_eq!(total, 0);
        assert!(photos.is_empty());
    }

    #[test]
    fn get_all_tags_empty() {
        let (catalog, _dir) = test_catalog();
        let tags = catalog.get_all_tags().unwrap();
        assert!(tags.is_empty());
    }

    #[test]
    fn search_text_empty() {
        let (catalog, _dir) = test_catalog();
        let results = catalog.search_text("dog", 10).unwrap();
        assert!(results.is_empty());
    }

    fn insert_named(catalog: &Catalog, relative_path: &str, hash: u8) {
        catalog
            .write(WriteOp::InsertPhoto(PhotoInsert {
                file_path: format!("/tmp/{relative_path}"),
                relative_path: relative_path.into(),
                watched_folder_id: None,
                file_hash: vec![hash],
                file_size: 1,
                width: 1,
                height: 1,
                taken_at: None,
                camera_make: None,
                camera_model: None,
                source_device: None,
                original_name: None,
                thumbnail_path: None,
            }))
            .unwrap();
    }

    #[test]
    fn search_treats_percent_as_a_literal_not_a_wildcard() {
        let (catalog, _dir) = test_catalog();
        insert_named(&catalog, "battery 100% charged.jpg", 1);
        insert_named(&catalog, "sunset.jpg", 2);
        insert_named(&catalog, "dog.jpg", 3);

        // Before escaping, "%" was a LIKE wildcard and this returned everything.
        let results = catalog.search_text("%", 50).unwrap();
        assert_eq!(
            results.len(),
            1,
            "searching for '%' should match only the photo containing a literal %"
        );
        assert_eq!(results[0].relative_path, "battery 100% charged.jpg");
    }

    #[test]
    fn search_treats_underscore_as_a_literal_not_a_wildcard() {
        let (catalog, _dir) = test_catalog();
        insert_named(&catalog, "my_photo.jpg", 1);
        insert_named(&catalog, "myXphoto.jpg", 2);

        let results = catalog.search_text("my_photo", 50).unwrap();
        assert_eq!(
            results.len(),
            1,
            "'_' should match a literal underscore, not any character"
        );
        assert_eq!(results[0].relative_path, "my_photo.jpg");
    }

    #[test]
    fn search_still_matches_normally() {
        let (catalog, _dir) = test_catalog();
        insert_named(&catalog, "brown dog on couch.jpg", 1);
        insert_named(&catalog, "sunset.jpg", 2);

        let results = catalog.search_text("dog", 50).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].relative_path, "brown dog on couch.jpg");
    }
}
