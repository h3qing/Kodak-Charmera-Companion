use std::path::Path;

use anyhow::{Context, Result};
use image::DynamicImage;

use crate::constants::DEFAULT_JPEG_QUALITY;
use crate::effects;

/// Export a photo with optional effects and frame applied.
pub fn export_photo(
    source: &DynamicImage,
    dest: &Path,
    effect_names: &[String],
    frame: Option<&str>,
    max_dimension: Option<u32>,
) -> Result<()> {
    let mut result = effects::apply_pipeline(source, effect_names, frame)?;

    if let Some(max_dim) = max_dimension {
        if result.width() > max_dim || result.height() > max_dim {
            result = result.resize(max_dim, max_dim, image::imageops::FilterType::Lanczos3);
        }
    }

    let rgb = result.to_rgb8();
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
