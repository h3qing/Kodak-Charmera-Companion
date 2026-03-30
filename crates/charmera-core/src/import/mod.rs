use std::path::{Path, PathBuf};

use anyhow::{bail, Result};

use crate::constants::*;

/// Sanitize a user-provided label for use in filenames.
/// Strips path separators, null bytes, and restricts to safe characters.
pub fn sanitize_label(label: &str) -> String {
    label
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
        .take(64)
        .collect::<String>()
        .trim()
        .to_string()
}

/// Find camera mount point by checking known volume paths.
pub fn find_camera() -> Option<PathBuf> {
    for path_str in VOLUME_PATHS {
        let path = PathBuf::from(path_str);
        let dcim = path.join(DCIM_DIR);
        if dcim.is_dir() {
            return Some(path);
        }
    }
    None
}

/// Find camera or return an error with helpful message.
pub fn find_camera_or_raise() -> Result<PathBuf> {
    find_camera().ok_or_else(|| {
        let paths: Vec<_> = VOLUME_PATHS.iter().map(|p| p.to_string()).collect();
        anyhow::anyhow!(
            "No camera found. Searched: {}. Connect your KODAK CHARMERA and try again.",
            paths.join(", ")
        )
    })
}

/// List all media files in a directory (recursive, up to depth 3).
pub fn list_media_files(source: &Path) -> Result<Vec<PathBuf>> {
    let dcim = source.join(DCIM_DIR);
    let search_dir = if dcim.is_dir() { &dcim } else { source };

    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(search_dir)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                // Skip dotfiles
                if name.starts_with('.') {
                    continue;
                }
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    let ext_lower = format!(".{}", ext.to_lowercase());
                    if PHOTO_EXTENSIONS.contains(&ext_lower.as_str())
                        || VIDEO_EXTENSIONS.contains(&ext_lower.as_str())
                    {
                        files.push(path.to_owned());
                    }
                }
            }
        }
    }

    files.sort();
    Ok(files)
}

/// Build a new filename with smart renaming.
pub fn build_new_name(
    date_str: &str,
    label: &str,
    counter: u32,
    extension: &str,
) -> String {
    let safe_label = sanitize_label(label);
    if safe_label.is_empty() {
        format!("{date_str} {counter:03}{extension}")
    } else {
        format!("{date_str} {safe_label} {counter:03}{extension}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path_separators() {
        assert_eq!(sanitize_label("../../etc/passwd"), "etcpasswd");
    }

    #[test]
    fn sanitize_strips_null_bytes() {
        assert_eq!(sanitize_label("hello\0world"), "helloworld");
    }

    #[test]
    fn sanitize_preserves_safe_chars() {
        assert_eq!(sanitize_label("beach day"), "beach day");
        assert_eq!(sanitize_label("my-photos_2026"), "my-photos_2026");
    }

    #[test]
    fn sanitize_truncates_at_64() {
        let long = "a".repeat(100);
        assert_eq!(sanitize_label(&long).len(), 64);
    }

    #[test]
    fn build_name_with_label() {
        let name = build_new_name("03-29-2026", "beach", 1, ".jpg");
        assert_eq!(name, "03-29-2026 beach 001.jpg");
    }

    #[test]
    fn build_name_without_label() {
        let name = build_new_name("03-29-2026", "", 5, ".jpg");
        assert_eq!(name, "03-29-2026 005.jpg");
    }
}
