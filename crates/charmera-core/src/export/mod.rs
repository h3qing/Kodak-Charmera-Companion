use std::path::Path;

use anyhow::{Context, Result};
use image::DynamicImage;

use crate::constants::DEFAULT_JPEG_QUALITY;

/// Export a photo as JPEG, optionally downscaling to fit `max_dimension`.
pub fn export_photo(source: &DynamicImage, dest: &Path, max_dimension: Option<u32>) -> Result<()> {
    let resized = match max_dimension {
        Some(max_dim) if source.width() > max_dim || source.height() > max_dim => {
            source.resize(max_dim, max_dim, image::imageops::FilterType::Lanczos3)
        }
        _ => source.clone(),
    };

    let rgb = resized.to_rgb8();
    let mut buf = std::io::BufWriter::new(
        std::fs::File::create(dest)
            .with_context(|| format!("creating export: {}", dest.display()))?,
    );
    let encoder =
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, DEFAULT_JPEG_QUALITY);
    rgb.write_with_encoder(encoder)
        .with_context(|| "encoding export JPEG")?;

    Ok(())
}
