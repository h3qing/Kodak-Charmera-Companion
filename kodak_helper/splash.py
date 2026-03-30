"""Boot splash screen customizer.

The Generalplus CBB3 reads SPIDCIM/SPI00.jpg from the SD card
as the boot splash screen. This module handles creating and
installing custom splash images.
"""

from pathlib import Path

from PIL import Image

from .constants import (
    SPLASH_DIR,
    SPLASH_FILE,
    SPLASH_HEIGHT,
    SPLASH_JPEG_QUALITY,
    SPLASH_WIDTH,
)


def create_splash(
    image_path: Path,
    output_path: Path | None = None,
    text: str | None = None,
) -> Path:
    """Convert any image to a camera-compatible splash screen.

    Args:
        image_path: Source image
        output_path: Where to save (defaults to same dir as source)
        text: Optional text overlay

    Returns:
        Path to the generated splash image
    """
    with Image.open(image_path) as img:
        img = img.convert("RGB")
        splash = _resize_and_crop(img, SPLASH_WIDTH, SPLASH_HEIGHT)

    if text:
        splash = _add_text_overlay(splash, text)

    dest = output_path or image_path.parent / SPLASH_FILE
    splash.save(
        str(dest),
        format="JPEG",
        quality=SPLASH_JPEG_QUALITY,
        subsampling=0,
        progressive=False,
    )
    return dest


def install_splash(image_path: Path, camera_path: Path) -> Path:
    """Create splash and install directly to camera SD card.

    Args:
        image_path: Source image to use as splash
        camera_path: Camera mount point (e.g. /Volumes/SDCARD)

    Returns:
        Path to installed splash image
    """
    splash_dir = camera_path / SPLASH_DIR
    splash_dir.mkdir(exist_ok=True)

    dest = splash_dir / SPLASH_FILE
    return create_splash(image_path, output_path=dest)


def _resize_and_crop(img: Image.Image, width: int, height: int) -> Image.Image:
    """Resize image to fill target dimensions, cropping to center."""
    target_ratio = width / height
    img_ratio = img.width / img.height

    if img_ratio > target_ratio:
        # Image is wider — fit height, crop width
        new_height = height
        new_width = int(height * img_ratio)
    else:
        # Image is taller — fit width, crop height
        new_width = width
        new_height = int(width / img_ratio)

    resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    left = (new_width - width) // 2
    top = (new_height - height) // 2
    return resized.crop((left, top, left + width, top + height))


def _add_text_overlay(img: Image.Image, text: str) -> Image.Image:
    """Add text to the bottom of the splash image. Returns a new image."""
    from PIL import ImageDraw, ImageFont

    result = img.copy()
    draw = ImageDraw.Draw(result)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36)
    except OSError:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (img.width - text_width) // 2
    y = img.height - text_height - 30

    # Shadow for readability
    draw.text((x + 2, y + 2), text, fill=(0, 0, 0), font=font)
    draw.text((x, y), text, fill=(255, 255, 255), font=font)

    return result
