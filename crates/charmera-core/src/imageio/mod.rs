//! Guarded image decoding.
//!
//! `image::open` will happily allocate whatever a file's header asks for. A
//! 20000×20000 PNG is a ~500 KB download that decodes to well over a gigabyte
//! of pixels — a "decompression bomb". Photos arrive here from SD cards and
//! arbitrary folders the user drags in, so every decode in the app goes through
//! this module instead of calling `image::open` directly.

use std::path::Path;

use anyhow::{Context, Result};
use image::{DynamicImage, ImageReader, Limits};

/// Largest pixel buffer we will allocate for a single decode, in bytes.
///
/// 512 MB comfortably covers real camera output (a 100-megapixel RGBA image is
/// ~400 MB) while refusing the pathological cases.
const MAX_ALLOC_BYTES: u64 = 512 * 1024 * 1024;

/// Largest accepted image edge, in pixels.
///
/// Well above any consumer camera (the CHARMERA shoots 1440×1080) and above
/// 8K, so this only rejects images that are already unreasonable.
const MAX_DIMENSION: u32 = 40_000;

fn limits() -> Limits {
    let mut limits = Limits::default();
    limits.max_alloc = Some(MAX_ALLOC_BYTES);
    limits.max_image_width = Some(MAX_DIMENSION);
    limits.max_image_height = Some(MAX_DIMENSION);
    limits
}

/// Decode an image from disk with allocation and dimension limits applied.
///
/// Prefer this over `image::open` everywhere.
pub fn open_limited(path: &Path) -> Result<DynamicImage> {
    let mut reader = ImageReader::open(path)
        .with_context(|| format!("opening image: {}", path.display()))?
        .with_guessed_format()
        .with_context(|| format!("detecting image format: {}", path.display()))?;

    reader.limits(limits());

    reader.decode().with_context(|| {
        format!(
            "decoding image: {} (images above {MAX_DIMENSION}px per side, or needing \
             more than {} MB to decode, are rejected)",
            path.display(),
            MAX_ALLOC_BYTES / (1024 * 1024),
        )
    })
}

/// Read image dimensions from the header without decoding pixel data.
pub fn dimensions(path: &Path) -> Result<(u32, u32)> {
    let reader = ImageReader::open(path)
        .with_context(|| format!("opening: {}", path.display()))?
        .with_guessed_format()
        .with_context(|| format!("detecting image format: {}", path.display()))?;
    reader
        .into_dimensions()
        .with_context(|| format!("reading dimensions: {}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbImage};

    fn write_png(dir: &Path, name: &str, w: u32, h: u32) -> std::path::PathBuf {
        let path = dir.join(name);
        let img = RgbImage::new(w, h);
        img.save_with_format(&path, ImageFormat::Png).unwrap();
        path
    }

    #[test]
    fn decodes_a_normal_photo() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_png(dir.path(), "ok.png", 64, 48);
        let img = open_limited(&path).unwrap();
        assert_eq!((img.width(), img.height()), (64, 48));
    }

    #[test]
    fn dimensions_does_not_decode() {
        let dir = tempfile::tempdir().unwrap();
        let path = write_png(dir.path(), "dims.png", 120, 90);
        assert_eq!(dimensions(&path).unwrap(), (120, 90));
    }

    #[test]
    fn rejects_an_oversize_image_that_is_otherwise_valid() {
        // A complete, well-formed PNG one pixel past the width limit. Using a
        // real image (rather than a truncated header) is what makes this test
        // meaningful: it can only fail because of the limit, not because the
        // file is corrupt. A 40001x1 image is a few KB on disk, so the test
        // stays fast while proving the guard fires.
        let dir = tempfile::tempdir().unwrap();
        let path = write_png(dir.path(), "wide.png", MAX_DIMENSION + 1, 1);

        // The header is readable, so the file is genuinely valid...
        assert_eq!(dimensions(&path).unwrap(), (MAX_DIMENSION + 1, 1));

        // ...and the decode is refused anyway.
        let err = open_limited(&path).unwrap_err();
        let msg = format!("{err:#}");
        assert!(
            msg.contains("decoding image"),
            "expected the guarded decode to reject it, got: {msg}"
        );
    }

    #[test]
    fn accepts_an_image_at_the_dimension_limit() {
        // Guard against the limit being off by one in the strict direction.
        let dir = tempfile::tempdir().unwrap();
        let path = write_png(dir.path(), "edge.png", MAX_DIMENSION, 1);
        assert!(open_limited(&path).is_ok());
    }
}
