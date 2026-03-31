#!/usr/bin/env python3.11
"""Generate a UI mockup screenshot of Charmera Companion for README/website."""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 750
SIDEBAR_W = 220

# Colors
YELLOW = (252, 194, 0)
YELLOW_DARK = (229, 175, 0)
RED = (196, 30, 58)
CREAM = (250, 246, 240)
CREAM_DARK = (237, 231, 219)
CHARCOAL = (28, 28, 28)
CHARCOAL_LIGHT = (58, 58, 58)
WARM_GRAY = (122, 110, 98)
BROWN = (45, 36, 32)
WHITE = (255, 255, 255)
GREEN = (34, 197, 94)
BLUE = (0, 61, 165)
ORANGE = (232, 125, 30)
PURPLE = (61, 31, 110)

# Stripe colors
STRIPE_COLORS = [RED, ORANGE, (139, 69, 19), CHARCOAL, BLUE, PURPLE]


def get_font(size, bold=False):
    paths = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_rounded_rect(draw, bbox, radius, fill):
    x0, y0, x1, y1 = bbox
    draw.rectangle([x0 + radius, y0, x1 - radius, y1], fill=fill)
    draw.rectangle([x0, y0 + radius, x1, y1 - radius], fill=fill)
    draw.pieslice([x0, y0, x0 + 2*radius, y0 + 2*radius], 180, 270, fill=fill)
    draw.pieslice([x1 - 2*radius, y0, x1, y0 + 2*radius], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2*radius, x0 + 2*radius, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2*radius, y1 - 2*radius, x1, y1], 0, 90, fill=fill)


def draw_stripe(draw, y, width, height=4):
    seg_w = width // len(STRIPE_COLORS)
    for i, color in enumerate(STRIPE_COLORS):
        draw.rectangle([i * seg_w, y, (i + 1) * seg_w, y + height], fill=color)


def draw_photo_placeholder(draw, x, y, w, h, color_seed):
    """Draw a colored rectangle simulating a photo thumbnail."""
    colors = [
        (180, 140, 100), (100, 150, 180), (150, 180, 100),
        (180, 100, 140), (140, 120, 180), (170, 160, 120),
        (120, 170, 150), (160, 130, 160), (140, 160, 130),
    ]
    base = colors[color_seed % len(colors)]
    # Add slight variation
    c = tuple(min(255, max(0, v + (color_seed * 17) % 40 - 20)) for v in base)
    draw_rounded_rect(draw, [x, y, x + w, y + h], 6, c)
    # Simulate image content with lighter rectangle
    inner_c = tuple(min(255, v + 30) for v in c)
    margin = 3
    draw.rectangle([x + margin, y + margin, x + w - margin, y + h - margin], fill=inner_c)


def generate():
    img = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(img)

    font_tiny = get_font(10)
    font_small = get_font(11)
    font_med = get_font(13)
    font_med_bold = get_font(13, bold=True)
    font_large = get_font(16, bold=True)
    font_xl = get_font(11, bold=True)

    # === Window chrome (macOS-style title bar) ===
    draw.rectangle([0, 0, W, 28], fill=(235, 235, 235))
    # Traffic lights
    for i, color in enumerate([(255, 95, 87), (255, 189, 46), (39, 201, 63)]):
        cx = 16 + i * 22
        draw.ellipse([cx - 6, 8, cx + 6, 20], fill=color)
    # Title
    draw.text((W // 2 - 60, 7), "Charmera Companion", fill=(120, 120, 120), font=font_small)

    # === Sidebar ===
    draw.rectangle([0, 28, SIDEBAR_W, H], fill=CREAM)
    draw.line([SIDEBAR_W, 28, SIDEBAR_W, H], fill=CREAM_DARK)

    # Logo area
    draw.rectangle([0, 28, SIDEBAR_W, 90], fill=YELLOW)
    draw.text((16, 36), "Kodak", fill=RED, font=font_med_bold)
    draw.text((16, 53), "Charmera", fill=WHITE, font=font_large)
    # 1987 badge
    draw_rounded_rect(draw, [170, 68, 210, 82], 7, CHARCOAL)
    draw.text((176, 70), "1987", fill=WHITE, font=font_tiny)

    # Rainbow stripe
    draw_stripe(draw, 90, SIDEBAR_W)

    # Nav items
    nav_y = 104
    draw.text((16, nav_y), "LIBRARY", fill=WARM_GRAY, font=font_tiny)
    nav_y += 16

    # Active item: All Photos
    draw_rounded_rect(draw, [8, nav_y, SIDEBAR_W - 8, nav_y + 26], 6, (252, 194, 0, 40))
    draw.rectangle([8, nav_y + 5, 10, nav_y + 21], fill=YELLOW)
    draw.text((24, nav_y + 6), "All Photos", fill=YELLOW_DARK, font=font_med_bold)
    draw_rounded_rect(draw, [168, nav_y + 5, 205, nav_y + 21], 8, (252, 194, 0, 60))
    draw.text((176, nav_y + 6), "36", fill=YELLOW_DARK, font=font_tiny)
    nav_y += 32

    draw.text((24, nav_y + 6), "Recent Imports", fill=(100, 90, 80), font=font_med)
    nav_y += 28

    nav_y += 10
    draw.text((16, nav_y), "ORGANIZE", fill=WARM_GRAY, font=font_tiny)
    nav_y += 16
    draw.text((24, nav_y + 6), "Tags", fill=(100, 90, 80), font=font_med)
    nav_y += 28
    draw.text((24, nav_y + 6), "Smart Albums", fill=(100, 90, 80), font=font_med)
    nav_y += 28
    draw.text((24, nav_y + 6), "Duplicates", fill=(100, 90, 80), font=font_med)
    nav_y += 36

    # AI button
    draw_rounded_rect(draw, [12, nav_y, SIDEBAR_W - 12, nav_y + 32], 8, YELLOW)
    draw.text((30, nav_y + 8), "Auto Label Photos", fill=WHITE, font=font_med_bold)
    nav_y += 40
    draw.text((16, nav_y), "Done! Labeled 36 photos", fill=WARM_GRAY, font=font_tiny)

    # === Header bar ===
    header_y = 28
    draw.rectangle([SIDEBAR_W, header_y, W, header_y + 44], fill=(250, 246, 240, 230))
    # Search bar
    draw_rounded_rect(draw, [SIDEBAR_W + 16, header_y + 9, SIDEBAR_W + 320, header_y + 35], 8, (255, 255, 255, 180))
    draw.rectangle([SIDEBAR_W + 17, header_y + 10, SIDEBAR_W + 319, header_y + 34], fill=WHITE, outline=CREAM_DARK)
    draw.text((SIDEBAR_W + 36, header_y + 14), "Search photos...", fill=WARM_GRAY, font=font_small)
    # Photo count
    draw.text((W - 100, header_y + 15), "36 photos", fill=WARM_GRAY, font=font_small)

    # Rainbow stripe under header
    for i, color in enumerate(STRIPE_COLORS):
        seg_w = (W - SIDEBAR_W) // len(STRIPE_COLORS)
        draw.rectangle([SIDEBAR_W + i * seg_w, header_y + 44, SIDEBAR_W + (i + 1) * seg_w, header_y + 46], fill=color)

    # === Toolbar ===
    tb_y = header_y + 46
    draw.rectangle([SIDEBAR_W, tb_y, W, tb_y + 28], fill=(250, 246, 240, 128))
    draw.text((SIDEBAR_W + 12, tb_y + 8), "36 photos", fill=WARM_GRAY, font=font_tiny)
    # Sort dropdown
    draw_rounded_rect(draw, [W - 220, tb_y + 4, W - 130, tb_y + 22], 4, WHITE)
    draw.text((W - 215, tb_y + 6), "Newest first", fill=CHARCOAL, font=font_tiny)
    # Grid size buttons
    for i in range(3):
        bx = W - 120 + i * 28
        c = (252, 194, 0, 50) if i == 1 else WHITE
        draw_rounded_rect(draw, [bx, tb_y + 4, bx + 24, tb_y + 22], 3, c)

    draw.line([SIDEBAR_W, tb_y + 28, W, tb_y + 28], fill=CREAM_DARK)

    # === Photo grid ===
    grid_y = tb_y + 32
    grid_x_start = SIDEBAR_W + 12
    cell_w = 148
    cell_h = 110
    gap = 8
    cols = 6

    for row in range(4):
        for col in range(cols):
            x = grid_x_start + col * (cell_w + gap)
            y = grid_y + row * (cell_h + gap + 20)
            if x + cell_w > W - 12:
                continue

            idx = row * cols + col
            draw_photo_placeholder(draw, x, y, cell_w, cell_h, idx)

            # AI label overlay on hover-like state for a couple
            if idx in (0, 5, 8):
                # Dark gradient at bottom
                for gy in range(25):
                    alpha = int(180 * (gy / 25))
                    overlay_y = y + cell_h - 25 + gy
                    draw.line([x + 3, overlay_y, x + cell_w - 3, overlay_y],
                             fill=(0, 0, 0))
                labels = [
                    "A brown dog on the couch",
                    "Sunset over the ocean",
                    "Friends at the park",
                ]
                draw.text((x + 6, y + cell_h - 18), labels[idx % 3][:24], fill=WHITE, font=font_tiny)

            # Filename below
            names = [
                "b 03-30 brown dog.jpg", "PICT0001.jpg", "PICT0002.jpg",
                "b 03-30 sunset.jpg", "PICT0004.jpg", "b 03-30 friends.jpg",
                "PICT0006.jpg", "PICT0007.jpg", "b 03-29 park.jpg",
            ]
            draw.text((x + 2, y + cell_h + 3), names[idx % len(names)][:20], fill=WARM_GRAY, font=font_tiny)

    # === Status bar ===
    draw.rectangle([0, H - 24, W, H], fill=CHARCOAL)
    draw.text((SIDEBAR_W + 12, H - 18), "36 photos indexed", fill=(200, 200, 200, 180), font=font_tiny)
    # Green camera dot
    draw.ellipse([SIDEBAR_W + 130, H - 16, SIDEBAR_W + 136, H - 10], fill=GREEN)
    draw.text((SIDEBAR_W + 140, H - 18), "Camera connected", fill=(200, 200, 200, 180), font=font_tiny)
    # AI status
    draw.ellipse([SIDEBAR_W + 290, H - 16, SIDEBAR_W + 296, H - 10], fill=YELLOW)
    draw.text((SIDEBAR_W + 300, H - 18), "AI ready (moondream)", fill=(200, 200, 200, 180), font=font_tiny)

    # === Window shadow/border ===
    # Add subtle border
    draw.rectangle([0, 0, W - 1, H - 1], outline=(200, 200, 200))

    # Save
    output = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "screenshot.png")
    img.save(output, "PNG")
    print(f"Mockup saved to {output} ({W}x{H})")


if __name__ == "__main__":
    generate()
