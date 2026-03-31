#!/usr/bin/env python3.11
"""Generate the Charmera Companion app icon (1024x1024) in the Kodak Charmera 1987 style."""

from PIL import Image, ImageDraw, ImageFont
import math
import os

SIZE = 1024
PADDING = 80  # rounded rect inset

# Colors from the Kodak Charmera 1987 camera
KODAK_YELLOW = (252, 194, 0)
KODAK_YELLOW_DARK = (229, 175, 0)
KODAK_RED = (196, 30, 58)
KODAK_ORANGE = (232, 125, 30)
KODAK_BROWN = (139, 69, 19)
KODAK_BLACK = (28, 28, 28)
KODAK_BLUE = (0, 61, 165)
KODAK_PURPLE = (61, 31, 110)
CHARCOAL = (42, 42, 42)
CHARCOAL_LIGHT = (58, 58, 58)
DARK_GRAY = (80, 80, 80)
LENS_DARK = (30, 30, 35)
LENS_MID = (50, 50, 55)
WHITE = (255, 255, 255)
SHADOW = (200, 160, 0)


def rounded_rectangle(draw, bbox, radius, fill, outline=None, width=0):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = bbox
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=fill)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=fill)
    draw.pieslice([x0, y0, x0 + 2 * radius, y0 + 2 * radius], 180, 270, fill=fill)
    draw.pieslice([x1 - 2 * radius, y0, x1, y0 + 2 * radius], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2 * radius, x0 + 2 * radius, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2 * radius, y1 - 2 * radius, x1, y1], 0, 90, fill=fill)
    if outline and width:
        # Draw outline arcs and lines
        draw.arc([x0, y0, x0 + 2 * radius, y0 + 2 * radius], 180, 270, fill=outline, width=width)
        draw.arc([x1 - 2 * radius, y0, x1, y0 + 2 * radius], 270, 360, fill=outline, width=width)
        draw.arc([x0, y1 - 2 * radius, x0 + 2 * radius, y1], 90, 180, fill=outline, width=width)
        draw.arc([x1 - 2 * radius, y1 - 2 * radius, x1, y1], 0, 90, fill=outline, width=width)
        draw.line([x0 + radius, y0, x1 - radius, y0], fill=outline, width=width)
        draw.line([x0 + radius, y1, x1 - radius, y1], fill=outline, width=width)
        draw.line([x0, y0 + radius, x0, y1 - radius], fill=outline, width=width)
        draw.line([x1, y0 + radius, x1, y1 - radius], fill=outline, width=width)


def draw_concentric_circle(draw, cx, cy, radius, color, width=2):
    """Draw a circle outline."""
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=color,
        width=width,
    )


def generate_icon():
    # Create image with transparency
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # === Background: rounded square (macOS icon shape) ===
    corner_r = 180
    rounded_rectangle(draw, [0, 0, SIZE - 1, SIZE - 1], corner_r, KODAK_YELLOW)

    # === Subtle 3D effect: top highlight ===
    for i in range(6):
        alpha_color = (255, 220, 60, max(0, 30 - i * 5))
        # We can't easily do alpha with ImageDraw, so skip this for clean look

    # === Rainbow stripe band across middle ===
    stripe_top = 400
    stripe_height = 120
    stripe_colors = [
        (KODAK_RED, 0.20),
        (KODAK_ORANGE, 0.15),
        (KODAK_BROWN, 0.15),
        (KODAK_BLACK, 0.15),
        (KODAK_BLUE, 0.15),
        (KODAK_PURPLE, 0.20),
    ]
    y = stripe_top
    for color, fraction in stripe_colors:
        h = int(stripe_height * fraction)
        draw.rectangle([0, y, SIZE, y + h], fill=color)
        y += h

    # === Camera lens (center) ===
    cx, cy = SIZE // 2, SIZE // 2 + 20  # slightly below center
    lens_outer_r = 170

    # Outer lens ring (dark)
    draw.ellipse(
        [cx - lens_outer_r, cy - lens_outer_r, cx + lens_outer_r, cy + lens_outer_r],
        fill=CHARCOAL,
    )

    # Lens ring highlight
    draw_concentric_circle(draw, cx, cy, lens_outer_r, CHARCOAL_LIGHT, width=4)

    # Inner lens ring
    inner_r = 140
    draw.ellipse(
        [cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r],
        fill=KODAK_BLACK,
    )
    draw_concentric_circle(draw, cx, cy, inner_r, DARK_GRAY, width=3)

    # Lens glass (gradient-like concentric circles)
    glass_r = 110
    for r in range(glass_r, 20, -4):
        brightness = int(25 + (glass_r - r) * 0.3)
        color = (brightness, brightness, brightness + 5)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)

    # Lens center highlight (reflection)
    highlight_r = 35
    hx, hy = cx - 25, cy - 25
    for r in range(highlight_r, 0, -1):
        alpha = int(60 * (1 - r / highlight_r))
        color = (100 + alpha, 100 + alpha, 110 + alpha)
        draw.ellipse([hx - r, hy - r, hx + r, hy + r], fill=color)

    # Innermost lens ring
    draw_concentric_circle(draw, cx, cy, 55, (70, 70, 75), width=2)
    draw_concentric_circle(draw, cx, cy, 95, (55, 55, 60), width=2)

    # === "C" lettermark in the lens center ===
    # Draw a bold "C" in Kodak Yellow inside the lens
    try:
        # Try to find a bold system font
        font_paths = [
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/SFNSDisplay.ttf",
            "/Library/Fonts/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        ]
        c_font = None
        for fp in font_paths:
            if os.path.exists(fp):
                c_font = ImageFont.truetype(fp, 100)
                break
        if c_font is None:
            c_font = ImageFont.load_default()
    except Exception:
        c_font = ImageFont.load_default()

    # Draw the "C" centered in the lens
    c_text = "C"
    c_bbox = draw.textbbox((0, 0), c_text, font=c_font)
    c_w = c_bbox[2] - c_bbox[0]
    c_h = c_bbox[3] - c_bbox[1]
    c_x = cx - c_w // 2
    c_y = cy - c_h // 2 - c_bbox[1]
    draw.text((c_x, c_y), c_text, fill=KODAK_YELLOW, font=c_font)

    # === Top buttons (like camera top) ===
    btn_y = 120
    btn_r = 26
    # Left button
    draw.ellipse(
        [180 - btn_r, btn_y - btn_r, 180 + btn_r, btn_y + btn_r],
        fill=CHARCOAL,
    )
    # Right button
    draw.ellipse(
        [300 - btn_r, btn_y - btn_r, 300 + btn_r, btn_y + btn_r],
        fill=CHARCOAL,
    )

    # === "Kodak" text (top, red) ===
    try:
        font_paths_bold = [
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/Library/Fonts/Arial Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
        ]
        title_font = None
        for fp in font_paths_bold:
            if os.path.exists(fp):
                title_font = ImageFont.truetype(fp, 72)
                break
        if title_font is None:
            title_font = ImageFont.load_default()

        small_font = None
        for fp in font_paths_bold:
            if os.path.exists(fp):
                small_font = ImageFont.truetype(fp, 52)
                break
        if small_font is None:
            small_font = ImageFont.load_default()
    except Exception:
        title_font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # "Kodak" in red, centered above the stripe
    kodak_text = "Kodak"
    kodak_bbox = draw.textbbox((0, 0), kodak_text, font=title_font)
    kodak_w = kodak_bbox[2] - kodak_bbox[0]
    charm_text = "Charmera"
    charm_bbox = draw.textbbox((0, 0), charm_text, font=small_font)
    charm_w = charm_bbox[2] - charm_bbox[0]
    total_w = kodak_w + 15 + charm_w
    start_x = (SIZE - total_w) // 2
    kodak_y = 260
    draw.text((start_x, kodak_y), kodak_text, fill=KODAK_RED, font=title_font)
    draw.text((start_x + kodak_w + 15, kodak_y + 10), charm_text, fill=WHITE, font=small_font)

    # === "1987" text (bottom right, large bold white) ===
    try:
        big_font = None
        for fp in font_paths_bold:
            if os.path.exists(fp):
                big_font = ImageFont.truetype(fp, 130)
                break
        if big_font is None:
            big_font = ImageFont.load_default()
    except Exception:
        big_font = ImageFont.load_default()

    year_text = "1987"
    year_bbox = draw.textbbox((0, 0), year_text, font=big_font)
    year_w = year_bbox[2] - year_bbox[0]
    year_x = SIZE - year_w - 100
    year_y = 700
    draw.text((year_x, year_y), year_text, fill=WHITE, font=big_font)

    # === Viewfinder window (top right) ===
    vf_x, vf_y = SIZE - 160, 100
    vf_w, vf_h = 65, 45
    rounded_rectangle(
        draw,
        [vf_x, vf_y, vf_x + vf_w, vf_y + vf_h],
        10,
        CHARCOAL,
    )
    # Inner lighter rectangle
    rounded_rectangle(
        draw,
        [vf_x + 7, vf_y + 7, vf_x + vf_w - 7, vf_y + vf_h - 7],
        5,
        CHARCOAL_LIGHT,
    )

    # === Save as RGBA (Tauri requires RGBA format) ===
    output_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "crates",
        "charmera-app",
        "icons",
        "icon.png",
    )
    # Fill transparent corners with yellow, keep as RGBA
    bg = Image.new("RGBA", (SIZE, SIZE), (*KODAK_YELLOW, 255))
    bg.paste(img, mask=img.split()[3])
    bg.save(output_path, "PNG")
    print(f"Icon saved to {output_path} ({SIZE}x{SIZE})")

    # Also save a 512x512 version
    img_512 = bg.resize((512, 512), Image.LANCZOS)
    output_512 = output_path.replace("icon.png", "icon-512.png")
    img_512.save(output_512, "PNG")
    print(f"Also saved {output_512} (512x512)")


if __name__ == "__main__":
    generate_icon()
