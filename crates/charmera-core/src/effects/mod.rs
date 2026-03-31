use anyhow::{Result, bail};
use image::DynamicImage;

/// Available effects.
pub const EFFECT_NAMES: &[&str] = &[
    "vintage",
    "noir",
    "faded",
    "warm",
    "cool",
    "sharp",
    "soft",
    "vignette",
    "grain",
    "light_leak",
];

/// Available frame styles.
pub const FRAME_NAMES: &[&str] = &["simple", "polaroid", "film_strip", "rounded"];

/// Apply a named effect to an image. Returns a NEW image (immutable pattern).
pub fn apply_effect(img: &DynamicImage, effect_name: &str) -> Result<DynamicImage> {
    match effect_name {
        "vintage" => Ok(vintage(img)),
        "noir" => Ok(noir(img)),
        "faded" => Ok(faded(img)),
        "warm" => Ok(warm(img)),
        "cool" => Ok(cool(img)),
        "sharp" => Ok(sharp(img)),
        "soft" => Ok(soft(img)),
        "vignette" => Ok(vignette(img)),
        "grain" => Ok(grain(img)),
        "light_leak" => Ok(light_leak(img)),
        _ => bail!("unknown effect: {effect_name}"),
    }
}

/// Apply a named frame to an image. Returns a NEW image.
pub fn apply_frame(img: &DynamicImage, frame_name: &str) -> Result<DynamicImage> {
    match frame_name {
        "simple" => Ok(frame_simple(img)),
        "polaroid" => Ok(frame_polaroid(img)),
        "film_strip" => Ok(frame_film_strip(img)),
        "rounded" => Ok(frame_rounded(img)),
        _ => bail!("unknown frame: {frame_name}"),
    }
}

/// Full effect pipeline: load original -> effects in order -> frame last.
pub fn apply_pipeline(
    img: &DynamicImage,
    effects: &[String],
    frame: Option<&str>,
) -> Result<DynamicImage> {
    let mut result = img.clone();
    for effect in effects {
        result = apply_effect(&result, effect)?;
    }
    if let Some(frame_name) = frame {
        result = apply_frame(&result, frame_name)?;
    }
    Ok(result)
}

// --- Effects (port from Python kodak_helper/effects.py) ---

fn vintage(img: &DynamicImage) -> DynamicImage {
    let mut rgb = img.to_rgb8();
    for pixel in rgb.pixels_mut() {
        let [r, g, b] = pixel.0;
        pixel.0 = [
            ((r as f32) * 1.1).min(255.0) as u8,
            ((g as f32) * 0.9).min(255.0) as u8,
            ((b as f32) * 0.7).min(255.0) as u8,
        ];
    }
    // Slight desaturation
    let hsv = DynamicImage::ImageRgb8(rgb);
    image::imageops::colorops::brighten(&hsv.to_rgb8(), -5);
    hsv
}

fn noir(img: &DynamicImage) -> DynamicImage {
    let gray = img.to_luma8();
    let contrasted = image::imageops::colorops::contrast(&gray, 30.0);
    DynamicImage::ImageLuma8(contrasted)
}

fn faded(img: &DynamicImage) -> DynamicImage {
    let mut rgb = img.to_rgb8();
    for pixel in rgb.pixels_mut() {
        let [r, g, b] = pixel.0;
        // Lift blacks, reduce contrast
        pixel.0 = [
            ((r as f32) * 0.85 + 30.0).min(255.0) as u8,
            ((g as f32) * 0.85 + 30.0).min(255.0) as u8,
            ((b as f32) * 0.85 + 30.0).min(255.0) as u8,
        ];
    }
    DynamicImage::ImageRgb8(rgb)
}

fn warm(img: &DynamicImage) -> DynamicImage {
    let mut rgb = img.to_rgb8();
    for pixel in rgb.pixels_mut() {
        let [r, g, b] = pixel.0;
        pixel.0 = [
            r.saturating_add(15),
            g.saturating_add(5),
            b.saturating_sub(10),
        ];
    }
    DynamicImage::ImageRgb8(rgb)
}

fn cool(img: &DynamicImage) -> DynamicImage {
    let mut rgb = img.to_rgb8();
    for pixel in rgb.pixels_mut() {
        let [r, g, b] = pixel.0;
        pixel.0 = [
            r.saturating_sub(10),
            g.saturating_add(5),
            b.saturating_add(15),
        ];
    }
    DynamicImage::ImageRgb8(rgb)
}

fn sharp(img: &DynamicImage) -> DynamicImage {
    image::imageops::unsharpen(&img.to_rgb8(), 1.5, 5).into()
}

fn soft(img: &DynamicImage) -> DynamicImage {
    // PIL GaussianBlur(radius=2) = kernel_size=5, sigma=2.5
    let blurred = image::imageops::blur(img, 2.5);
    let orig = img.to_rgba8();
    let blur_rgba = DynamicImage::ImageRgba8(blurred).to_rgba8();

    let mut result = orig.clone();
    let alpha = 0.7_f32; // blend 70% original, 30% blurred
    for (out, (o, b)) in result
        .pixels_mut()
        .zip(orig.pixels().zip(blur_rgba.pixels()))
    {
        for c in 0..3 {
            out.0[c] = ((o.0[c] as f32) * alpha + (b.0[c] as f32) * (1.0 - alpha)) as u8;
        }
        out.0[3] = o.0[3];
    }
    DynamicImage::ImageRgba8(result)
}

fn vignette(img: &DynamicImage) -> DynamicImage {
    let rgb = img.to_rgb8();
    let (w, h) = (rgb.width() as f32, rgb.height() as f32);
    let cx = w / 2.0;
    let cy = h / 2.0;
    let _max_dist = (cx * cx + cy * cy).sqrt();
    let strength = 0.7_f32;

    let mut result = rgb;
    for (x, y, pixel) in result.enumerate_pixels_mut() {
        let dx = (x as f32 - cx) / cx;
        let dy = (y as f32 - cy) / cy;
        let dist = (dx * dx + dy * dy).sqrt();
        let factor = 1.0 - (dist * strength).min(1.0);
        let factor = factor * factor; // quadratic falloff
        pixel.0 = [
            ((pixel.0[0] as f32) * factor) as u8,
            ((pixel.0[1] as f32) * factor) as u8,
            ((pixel.0[2] as f32) * factor) as u8,
        ];
    }
    DynamicImage::ImageRgb8(result)
}

fn grain(img: &DynamicImage) -> DynamicImage {
    let mut rgb = img.to_rgb8();
    let mut rng = fastrand::Rng::new();
    let intensity = 25_i16;
    for pixel in rgb.pixels_mut() {
        let noise = rng.i16(-intensity..=intensity);
        pixel.0 = [
            (pixel.0[0] as i16 + noise).clamp(0, 255) as u8,
            (pixel.0[1] as i16 + noise).clamp(0, 255) as u8,
            (pixel.0[2] as i16 + noise).clamp(0, 255) as u8,
        ];
    }
    DynamicImage::ImageRgb8(rgb)
}

fn light_leak(img: &DynamicImage) -> DynamicImage {
    let mut rgb = img.to_rgb8();
    let (w, h) = (rgb.width() as f32, rgb.height() as f32);

    for (x, y, pixel) in rgb.enumerate_pixels_mut() {
        // Warm light leak from top-right corner
        let dx = 1.0 - (x as f32 / w);
        let dy = y as f32 / h;
        let dist = (dx * dx + dy * dy).sqrt();
        let leak = ((1.0 - dist) * 80.0).max(0.0) as u8;
        pixel.0[0] = pixel.0[0].saturating_add(leak);
        pixel.0[1] = pixel.0[1].saturating_add(leak / 2);
    }
    DynamicImage::ImageRgb8(rgb)
}

// --- Frames ---

fn frame_simple(img: &DynamicImage) -> DynamicImage {
    let rgb = img.to_rgb8();
    let border = 20u32;
    let new_w = rgb.width() + border * 2;
    let new_h = rgb.height() + border * 2;
    let mut framed = image::RgbImage::from_pixel(new_w, new_h, image::Rgb([255, 255, 255]));
    image::imageops::overlay(&mut framed, &rgb, border as i64, border as i64);
    DynamicImage::ImageRgb8(framed)
}

fn frame_polaroid(img: &DynamicImage) -> DynamicImage {
    let rgb = img.to_rgb8();
    let side = 30u32;
    let top = 30u32;
    let bottom = 100u32;
    let new_w = rgb.width() + side * 2;
    let new_h = rgb.height() + top + bottom;
    let mut framed = image::RgbImage::from_pixel(new_w, new_h, image::Rgb([255, 255, 255]));
    image::imageops::overlay(&mut framed, &rgb, side as i64, top as i64);
    DynamicImage::ImageRgb8(framed)
}

fn frame_film_strip(img: &DynamicImage) -> DynamicImage {
    let rgb = img.to_rgb8();
    let border = 40u32;
    let new_w = rgb.width() + border * 2;
    let new_h = rgb.height() + border * 2;
    let mut framed = image::RgbImage::from_pixel(new_w, new_h, image::Rgb([20, 20, 20]));
    image::imageops::overlay(&mut framed, &rgb, border as i64, border as i64);

    // Draw sprocket holes
    let hole_size = 12u32;
    let hole_spacing = 30u32;
    let mut y = hole_spacing;
    while y + hole_size < new_h {
        // Left side holes
        for dy in 0..hole_size {
            for dx in 0..hole_size {
                if 8 + dx < border {
                    framed.put_pixel(8 + dx, y + dy, image::Rgb([180, 180, 180]));
                }
            }
        }
        // Right side holes
        for dy in 0..hole_size {
            for dx in 0..hole_size {
                let rx = new_w - 8 - hole_size + dx;
                if rx < new_w {
                    framed.put_pixel(rx, y + dy, image::Rgb([180, 180, 180]));
                }
            }
        }
        y += hole_spacing + hole_size;
    }
    DynamicImage::ImageRgb8(framed)
}

fn frame_rounded(img: &DynamicImage) -> DynamicImage {
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());
    let radius = 20u32;
    let mut result = rgba;

    for (x, y, pixel) in result.enumerate_pixels_mut() {
        let corners = [(0u32, 0u32), (w - 1, 0), (0, h - 1), (w - 1, h - 1)];
        for &(cx, cy) in &corners {
            let in_corner_x = if cx == 0 {
                x < radius
            } else {
                x > w - 1 - radius
            };
            let in_corner_y = if cy == 0 {
                y < radius
            } else {
                y > h - 1 - radius
            };
            if in_corner_x && in_corner_y {
                let corner_x = if cx == 0 { radius } else { w - 1 - radius };
                let corner_y = if cy == 0 { radius } else { h - 1 - radius };
                let dx = x as f32 - corner_x as f32;
                let dy = y as f32 - corner_y as f32;
                if (dx * dx + dy * dy).sqrt() > radius as f32 {
                    pixel.0[3] = 0; // transparent
                }
            }
        }
    }
    DynamicImage::ImageRgba8(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::DynamicImage;

    fn test_image() -> DynamicImage {
        DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            100,
            80,
            image::Rgb([128, 100, 80]),
        ))
    }

    #[test]
    fn all_effects_produce_output() {
        let img = test_image();
        for name in EFFECT_NAMES {
            let result = apply_effect(&img, name).unwrap();
            assert!(
                result.width() > 0 && result.height() > 0,
                "effect {name} produced empty image"
            );
        }
    }

    #[test]
    fn all_frames_produce_output() {
        let img = test_image();
        for name in FRAME_NAMES {
            let result = apply_frame(&img, name).unwrap();
            assert!(
                result.width() >= img.width(),
                "frame {name} should be at least as wide"
            );
        }
    }

    #[test]
    fn unknown_effect_returns_error() {
        let img = test_image();
        assert!(apply_effect(&img, "nonexistent").is_err());
    }

    #[test]
    fn pipeline_applies_effects_then_frame() {
        let img = test_image();
        let result =
            apply_pipeline(&img, &["vintage".into(), "warm".into()], Some("polaroid")).unwrap();
        // Polaroid frame adds borders, so result is larger
        assert!(result.width() > img.width());
        assert!(result.height() > img.height());
    }

    #[test]
    fn effects_do_not_mutate_original() {
        let img = test_image();
        let original_pixel = img.to_rgb8().get_pixel(50, 40).0;
        let _ = apply_effect(&img, "vintage").unwrap();
        let after_pixel = img.to_rgb8().get_pixel(50, 40).0;
        assert_eq!(original_pixel, after_pixel);
    }
}
