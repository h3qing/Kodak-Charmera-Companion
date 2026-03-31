use anyhow::Result;
use rusqlite::Connection;

pub const MIGRATIONS: &[&str] = &[MIGRATION_001];

const MIGRATION_001: &str = r#"
CREATE TABLE IF NOT EXISTS photos (
    id              INTEGER PRIMARY KEY,
    file_path       TEXT NOT NULL,
    relative_path   TEXT NOT NULL,
    watched_folder_id INTEGER,
    file_hash       BLOB NOT NULL,
    file_size       INTEGER NOT NULL,
    width           INTEGER NOT NULL DEFAULT 0,
    height          INTEGER NOT NULL DEFAULT 0,

    -- EXIF metadata
    taken_at        TEXT,
    camera_make     TEXT,
    camera_model    TEXT,

    -- AI-generated
    description     TEXT,
    embedding       BLOB,

    -- Perceptual hashes for dedup
    phash           INTEGER,
    dhash           INTEGER,

    -- Housekeeping
    thumbnail_path  TEXT,
    imported_at     TEXT NOT NULL DEFAULT (datetime('now')),
    last_scanned_at TEXT,
    is_hidden       INTEGER DEFAULT 0,
    rating          INTEGER DEFAULT 0,

    -- Source tracking
    source_device   TEXT,
    original_name   TEXT,

    UNIQUE(file_path)
);

CREATE INDEX IF NOT EXISTS idx_photos_taken_at ON photos(taken_at);
CREATE INDEX IF NOT EXISTS idx_photos_file_hash ON photos(file_hash);
CREATE INDEX IF NOT EXISTS idx_photos_phash ON photos(phash);
CREATE INDEX IF NOT EXISTS idx_photos_is_hidden ON photos(is_hidden);

CREATE TABLE IF NOT EXISTS tags (
    id       INTEGER PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    color    TEXT,
    source   TEXT NOT NULL DEFAULT 'user',
    category TEXT
);

CREATE TABLE IF NOT EXISTS photo_tags (
    photo_id    INTEGER REFERENCES photos(id) ON DELETE CASCADE,
    tag_id      INTEGER REFERENCES tags(id) ON DELETE CASCADE,
    confidence  REAL,
    PRIMARY KEY (photo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS albums (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    cover_photo INTEGER REFERENCES photos(id),
    album_type  TEXT NOT NULL DEFAULT 'manual',
    smart_query TEXT,
    sort_order  TEXT DEFAULT 'taken_at_desc',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS album_photos (
    album_id    INTEGER REFERENCES albums(id) ON DELETE CASCADE,
    photo_id    INTEGER REFERENCES photos(id) ON DELETE CASCADE,
    position    INTEGER,
    PRIMARY KEY (album_id, photo_id)
);

CREATE TABLE IF NOT EXISTS edits (
    id          INTEGER PRIMARY KEY,
    photo_id    INTEGER REFERENCES photos(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT 'default',
    edit_stack  TEXT NOT NULL,
    frame       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    is_active   INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS duplicate_groups (
    id          INTEGER PRIMARY KEY,
    group_type  TEXT NOT NULL,
    resolved    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS duplicate_members (
    group_id    INTEGER REFERENCES duplicate_groups(id) ON DELETE CASCADE,
    photo_id    INTEGER REFERENCES photos(id) ON DELETE CASCADE,
    similarity  REAL,
    is_primary  INTEGER DEFAULT 0,
    PRIMARY KEY (group_id, photo_id)
);

CREATE TABLE IF NOT EXISTS watched_folders (
    id          INTEGER PRIMARY KEY,
    path        TEXT NOT NULL UNIQUE,
    recursive   INTEGER DEFAULT 1,
    last_scan   TEXT,
    enabled     INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS jobs (
    id           INTEGER PRIMARY KEY,
    job_type     TEXT NOT NULL,
    photo_id     INTEGER REFERENCES photos(id),
    status       TEXT DEFAULT 'pending',
    progress     REAL DEFAULT 0.0,
    error        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
"#;

pub fn run_migrations(conn: &mut Connection) -> Result<()> {
    // Create the schema_version table if it does not exist
    conn.execute_batch("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY);")?;

    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    for (i, migration) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version > current_version {
            let tx = conn.transaction()?;
            tx.execute_batch(migration)?;
            tx.execute(
                "INSERT OR REPLACE INTO schema_version (version) VALUES (?1)",
                [version],
            )?;
            tx.commit()?;
            tracing::info!("applied migration {version}");
        }
    }

    Ok(())
}
