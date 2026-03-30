use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use image::imageops::FilterType;

use crate::constants::{THUMBNAIL_QUALITY, THUMBNAIL_SIZE};

/// Generate a thumbnail and save to the cache directory.
/// Returns the path to the saved thumbnail.
pub fn generate_thumbnail(
    source: &Path,
    cache_dir: &Path,
    file_hash: &[u8],
) -> Result<PathBuf> {
    let img = image::open(source)
        .with_context(|| format!("opening image: {}", source.display()))?;

    let thumb = img.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, FilterType::Lanczos3);

    // Shard by first 2 bytes of hash
    let hex = hex_prefix(file_hash);
    let shard_dir = cache_dir.join(&hex[..2]).join(&hex[2..4]);
    std::fs::create_dir_all(&shard_dir)?;

    let thumb_path = shard_dir.join(format!("{hex}.jpg"));
    thumb
        .to_rgb8()
        .save_with_format(&thumb_path, image::ImageFormat::Jpeg)
        .with_context(|| format!("saving thumbnail: {}", thumb_path.display()))?;

    Ok(thumb_path)
}

/// Get image dimensions without decoding the full image.
pub fn get_image_dimensions(path: &Path) -> Result<(u32, u32)> {
    let reader = image::ImageReader::open(path)
        .with_context(|| format!("opening: {}", path.display()))?;
    let (w, h) = reader
        .into_dimensions()
        .with_context(|| format!("reading dimensions: {}", path.display()))?;
    Ok((w, h))
}

fn hex_prefix(hash: &[u8]) -> String {
    hash.iter()
        .take(16)
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_prefix_produces_32_chars() {
        let hash = blake3::hash(b"test").as_bytes().to_vec();
        let hex = hex_prefix(&hash);
        assert_eq!(hex.len(), 32);
    }
}
