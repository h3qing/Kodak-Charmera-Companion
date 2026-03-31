use std::path::{Path, PathBuf};

use anyhow::Result;

use crate::constants::*;

/// EXIF metadata extracted from a photo.
#[derive(Debug, Default)]
pub struct ExifInfo {
    pub taken_at: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
}

/// Extract EXIF metadata from a JPEG file.
pub fn extract_exif(path: &Path) -> ExifInfo {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return ExifInfo::default(),
    };
    let mut bufreader = std::io::BufReader::new(file);
    let exif = match exif::Reader::new().read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return ExifInfo::default(),
    };

    let taken_at = exif
        .get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
        .or_else(|| exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY))
        .map(|f| f.display_value().to_string());

    let camera_make = exif
        .get_field(exif::Tag::Make, exif::In::PRIMARY)
        .map(|f| f.display_value().to_string().trim_matches('"').to_string());

    let camera_model = exif
        .get_field(exif::Tag::Model, exif::In::PRIMARY)
        .map(|f| f.display_value().to_string().trim_matches('"').to_string());

    ExifInfo {
        taken_at,
        camera_make,
        camera_model,
    }
}

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
pub fn build_new_name(date_str: &str, label: &str, counter: u32, extension: &str) -> String {
    let safe_label = sanitize_label(label);
    if safe_label.is_empty() {
        format!("{date_str} {counter:03}{extension}")
    } else {
        format!("{date_str} {safe_label} {counter:03}{extension}")
    }
}

/// Apply a naming pattern to generate a filename (without extension).
/// Pattern tokens: {MM}, {DD}, {YYYY}, {content}, {counter}, {original}
pub fn apply_naming_pattern(
    pattern: &str,
    taken_at: Option<&str>,
    description: &str,
    counter: u32,
    original_stem: &str,
) -> String {
    let (mm, dd, yyyy) = if let Some(date_str) = taken_at {
        parse_date_tokens(date_str)
    } else {
        let now = chrono::Local::now();
        use chrono::Datelike;
        (
            format!("{:02}", now.month()),
            format!("{:02}", now.day()),
            format!("{}", now.year()),
        )
    };

    let content = sanitize_label(
        &description
            .split('.')
            .next()
            .unwrap_or(description)
            .chars()
            .take(40)
            .collect::<String>(),
    );

    pattern
        .replace("{MM}", &mm)
        .replace("{DD}", &dd)
        .replace("{YYYY}", &yyyy)
        .replace("{content}", &content)
        .replace("{counter}", &format!("{counter:03}"))
        .replace("{original}", original_stem)
        .trim()
        .to_string()
}

/// Parse date tokens from various date formats.
fn parse_date_tokens(date_str: &str) -> (String, String, String) {
    use chrono::Datelike;

    // Try EXIF format: "YYYY:MM:DD HH:MM:SS"
    if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(date_str, "%Y:%m:%d %H:%M:%S") {
        return (
            format!("{:02}", dt.month()),
            format!("{:02}", dt.day()),
            format!("{}", dt.year()),
        );
    }
    // Try ISO format: "YYYY-MM-DD..."
    if date_str.len() >= 10 {
        let parts: Vec<&str> = date_str[..10].split('-').collect();
        if parts.len() == 3 {
            return (
                parts[1].to_string(),
                parts[2].to_string(),
                parts[0].to_string(),
            );
        }
    }
    // Fallback to current date
    let now = chrono::Local::now();
    (
        format!("{:02}", now.month()),
        format!("{:02}", now.day()),
        format!("{}", now.year()),
    )
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

    #[test]
    fn naming_pattern_default() {
        let result = apply_naming_pattern(
            "b {MM}-{DD}-{YYYY} {content}",
            Some("2026:03:30 14:30:00"),
            "A brown dog on the couch.",
            1,
            "PICT0042",
        );
        assert_eq!(result, "b 03-30-2026 A brown dog on the couch");
    }

    #[test]
    fn naming_pattern_with_counter_and_original() {
        let result = apply_naming_pattern(
            "{original}_{counter}_{content}",
            Some("2026-01-15"),
            "sunset at beach",
            7,
            "IMG_001",
        );
        assert_eq!(result, "IMG_001_007_sunset at beach");
    }

    #[test]
    fn naming_pattern_no_date_uses_today() {
        let result = apply_naming_pattern("{MM}-{DD}-{YYYY}", None, "", 1, "test");
        // Should produce today's date
        assert_eq!(result.len(), 10); // MM-DD-YYYY
        assert!(result.contains("-"));
    }

    #[test]
    fn naming_pattern_sanitizes_description() {
        let result = apply_naming_pattern(
            "{content}",
            None,
            "../../etc/passwd.txt is dangerous",
            1,
            "x",
        );
        // Path separators should be stripped
        assert!(!result.contains('/'));
        assert!(!result.contains(".."));
    }

    #[test]
    fn parse_date_exif_format() {
        let (mm, dd, yyyy) = parse_date_tokens("2026:03:30 14:30:00");
        assert_eq!(mm, "03");
        assert_eq!(dd, "30");
        assert_eq!(yyyy, "2026");
    }

    #[test]
    fn parse_date_iso_format() {
        let (mm, dd, yyyy) = parse_date_tokens("2026-01-15");
        assert_eq!(mm, "01");
        assert_eq!(dd, "15");
        assert_eq!(yyyy, "2026");
    }
}
