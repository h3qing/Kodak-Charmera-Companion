"""Photo effects and frames for post-processing camera photos.

All functions return new Image objects — originals are never mutated.
"""

from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

from .constants import DEFAULT_JPEG_QUALITY

# Type alias for effect functions
Effect = Callable[[Image.Image], Image.Image]


# --- Core effects ---


def vintage(img: Image.Image) -> Image.Image:
    """Warm vintage look with slight desaturation."""
    result = img.convert("RGB")
    result = ImageEnhance.Color(result).enhance(0.7)
    result = ImageEnhance.Contrast(result).enhance(1.1)

    # Warm tint via channel adjustment
    r, g, b = result.split()
    r = r.point(lambda x: min(255, int(x * 1.1)))
    b = b.point(lambda x: int(x * 0.9))
    return Image.merge("RGB", (r, g, b))


def noir(img: Image.Image) -> Image.Image:
    """High-contrast black and white."""
    result = img.convert("L")
    result = ImageEnhance.Contrast(result).enhance(1.4)
    return result.convert("RGB")


def faded(img: Image.Image) -> Image.Image:
    """Faded film look with lifted blacks."""
    result = img.convert("RGB")
    result = ImageEnhance.Contrast(result).enhance(0.85)

    # Lift the blacks
    return result.point(lambda x: min(255, x + 20))


def warm(img: Image.Image) -> Image.Image:
    """Warm golden tone."""
    result = img.convert("RGB")
    r, g, b = result.split()
    r = r.point(lambda x: min(255, int(x * 1.15)))
    g = g.point(lambda x: min(255, int(x * 1.05)))
    b = b.point(lambda x: int(x * 0.85))
    return Image.merge("RGB", (r, g, b))


def cool(img: Image.Image) -> Image.Image:
    """Cool blue tone."""
    result = img.convert("RGB")
    r, g, b = result.split()
    r = r.point(lambda x: int(x * 0.85))
    b = b.point(lambda x: min(255, int(x * 1.15)))
    return Image.merge("RGB", (r, g, b))


def sharp(img: Image.Image) -> Image.Image:
    """Sharpen details."""
    return img.filter(ImageFilter.SHARPEN)


def soft(img: Image.Image) -> Image.Image:
    """Dreamy soft focus."""
    blurred = img.filter(ImageFilter.GaussianBlur(radius=2))
    return Image.blend(img, blurred, alpha=0.4)


# --- Overlays ---


def vignette(img: Image.Image, strength: float = 0.6) -> Image.Image:
    """Dark vignette around edges."""
    result = img.convert("RGB")
    w, h = result.size

    mask = Image.new("L", (w, h), 255)
    draw = ImageDraw.Draw(mask)

    # Elliptical gradient
    for i in range(min(w, h) // 2):
        opacity = int(255 * (1 - strength * (1 - i / (min(w, h) / 2)) ** 2))
        draw.ellipse(
            [i, i, w - i, h - i],
            outline=opacity,
        )

    # Fill center with white
    center_x, center_y = w // 3, h // 3
    draw.ellipse(
        [center_x, center_y, w - center_x, h - center_y],
        fill=255,
    )

    dark = Image.new("RGB", (w, h), (0, 0, 0))
    return Image.composite(result, dark, mask)


def grain(img: Image.Image, intensity: int = 30) -> Image.Image:
    """Film grain noise overlay."""
    import numpy as np

    result = img.convert("RGB")
    arr = np.array(result, dtype=np.int16)
    noise = np.random.randint(-intensity, intensity + 1, size=arr.shape, dtype=np.int16)
    grained = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(grained)


def light_leak(img: Image.Image) -> Image.Image:
    """Warm light leak in corner."""
    result = img.convert("RGB")
    w, h = result.size

    leak = Image.new("RGB", (w, h), (0, 0, 0))
    draw = ImageDraw.Draw(leak)

    # Warm leak from top-right
    for i in range(min(w, h) // 2):
        opacity = max(0, 80 - i)
        color = (opacity, opacity // 2, 0)
        draw.ellipse(
            [w - min(w, h) // 2 + i, -i, w + i, min(w, h) // 2 - i],
            fill=color,
        )

    from PIL import ImageChops

    return ImageChops.add(result, leak)


# --- Frames ---


def frame_simple(
    img: Image.Image,
    border: int = 40,
    color: tuple[int, int, int] = (255, 255, 255),
) -> Image.Image:
    """Simple solid border frame."""
    result = img.convert("RGB")
    w, h = result.size
    framed = Image.new("RGB", (w + border * 2, h + border * 2), color)
    framed.paste(result, (border, border))
    return framed


def frame_polaroid(img: Image.Image) -> Image.Image:
    """Polaroid-style frame with thick bottom border."""
    result = img.convert("RGB")
    w, h = result.size
    top = 30
    sides = 30
    bottom = 100

    framed = Image.new("RGB", (w + sides * 2, h + top + bottom), (250, 248, 240))
    framed.paste(result, (sides, top))
    return framed


def frame_film_strip(img: Image.Image) -> Image.Image:
    """Film strip frame with sprocket holes."""
    result = img.convert("RGB")
    w, h = result.size
    strip_w = 50

    framed = Image.new("RGB", (w + strip_w * 2, h), (30, 30, 30))
    framed.paste(result, (strip_w, 0))

    draw = ImageDraw.Draw(framed)

    # Sprocket holes on both sides
    hole_h = 20
    hole_w = 30
    spacing = 40
    for y in range(10, h - hole_h, spacing):
        # Left strip
        draw.rounded_rectangle(
            [10, y, 10 + hole_w, y + hole_h],
            radius=4,
            fill=(60, 60, 60),
        )
        # Right strip
        draw.rounded_rectangle(
            [w + strip_w + 10, y, w + strip_w + 10 + hole_w, y + hole_h],
            radius=4,
            fill=(60, 60, 60),
        )

    return framed


def frame_rounded(
    img: Image.Image,
    radius: int = 30,
    bg: tuple[int, int, int] = (255, 255, 255),
) -> Image.Image:
    """Rounded corners with background."""
    result = img.convert("RGB")
    w, h = result.size
    border = 20

    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, w, h], radius=radius, fill=255)

    framed = Image.new("RGB", (w + border * 2, h + border * 2), bg)
    framed.paste(result, (border, border), mask)
    return framed


# --- Effect registry ---

EFFECTS: dict[str, Effect] = {
    "vintage": vintage,
    "noir": noir,
    "faded": faded,
    "warm": warm,
    "cool": cool,
    "sharp": sharp,
    "soft": soft,
    "vignette": vignette,
    "grain": grain,
    "light_leak": light_leak,
}

FRAMES: dict[str, Effect] = {
    "simple": frame_simple,
    "polaroid": frame_polaroid,
    "film_strip": frame_film_strip,
    "rounded": frame_rounded,
}


def apply_effects(
    image_path: Path,
    output_path: Path,
    effects: list[str] | None = None,
    frame: str | None = None,
) -> Path:
    """Apply effects and/or frame to a photo and save.

    Args:
        image_path: Source photo
        output_path: Where to save processed photo
        effects: List of effect names to apply (in order)
        frame: Frame name to apply

    Returns:
        Path to processed image
    """
    with Image.open(image_path) as img:
        result = img.convert("RGB")

    if effects:
        for name in effects:
            if name not in EFFECTS:
                raise ValueError(
                    f"Unknown effect: {name}. Available: {', '.join(EFFECTS)}"
                )
            result = EFFECTS[name](result)

    if frame:
        if frame not in FRAMES:
            raise ValueError(
                f"Unknown frame: {frame}. Available: {', '.join(FRAMES)}"
            )
        result = FRAMES[frame](result)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    result.save(str(output_path), format="JPEG", quality=DEFAULT_JPEG_QUALITY)
    return output_path
