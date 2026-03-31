use std::path::Path;

use anyhow::{Context, Result};
use image::DynamicImage;
use image::imageops::FilterType;

use crate::constants::*;

/// Create a splash screen image from a source photo.
/// Resizes and center-crops to 960x720.
pub fn create_splash(source: &DynamicImage) -> DynamicImage {
    let (src_w, src_h) = (source.width() as f32, source.height() as f32);
    let target_ratio = SPLASH_WIDTH as f32 / SPLASH_HEIGHT as f32;
    let src_ratio = src_w / src_h;

    let resized = if src_ratio > target_ratio {
        // Source is wider: fit height, crop width
        let new_h = SPLASH_HEIGHT;
        let new_w = (src_w * (SPLASH_HEIGHT as f32 / src_h)) as u32;
        source.resize(new_w, new_h, FilterType::Lanczos3)
    } else {
        // Source is taller: fit width, crop height
        let new_w = SPLASH_WIDTH;
        let new_h = (src_h * (SPLASH_WIDTH as f32 / src_w)) as u32;
        source.resize(new_w, new_h, FilterType::Lanczos3)
    };

    // Center crop to exact dimensions
    let x = (resized.width().saturating_sub(SPLASH_WIDTH)) / 2;
    let y = (resized.height().saturating_sub(SPLASH_HEIGHT)) / 2;
    resized.crop_imm(x, y, SPLASH_WIDTH, SPLASH_HEIGHT)
}

/// Save a splash screen JPEG with camera-compatible encoding params.
pub fn save_splash(img: &DynamicImage, path: &Path) -> Result<()> {
    let rgb = img.to_rgb8();
    let mut buf = std::io::BufWriter::new(
        std::fs::File::create(path)
            .with_context(|| format!("creating splash file: {}", path.display()))?,
    );

    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, SPLASH_JPEG_QUALITY);
    rgb.write_with_encoder(encoder)
        .with_context(|| "encoding splash JPEG")?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splash_produces_correct_dimensions() {
        let img = DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            2000,
            1500,
            image::Rgb([128, 128, 128]),
        ));
        let splash = create_splash(&img);
        assert_eq!(splash.width(), SPLASH_WIDTH);
        assert_eq!(splash.height(), SPLASH_HEIGHT);
    }

    #[test]
    fn splash_handles_portrait_source() {
        let img = DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            600,
            1200,
            image::Rgb([128, 128, 128]),
        ));
        let splash = create_splash(&img);
        assert_eq!(splash.width(), SPLASH_WIDTH);
        assert_eq!(splash.height(), SPLASH_HEIGHT);
    }
}
