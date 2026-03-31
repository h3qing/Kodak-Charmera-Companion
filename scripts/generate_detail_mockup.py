#!/usr/bin/env python3.11
"""Generate a mockup of the photo detail view with effects panel."""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1200, 750

YELLOW = (252, 194, 0)
CHARCOAL = (28, 28, 28)
CHARCOAL_LIGHT = (58, 58, 58)
BROWN = (45, 36, 32)
WHITE = (255, 255, 255)
WARM_GRAY = (122, 110, 98)
FILM_BORDER = (28, 28, 28)
CREAM = (250, 246, 240)


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
    r = min(radius, (y1 - y0) // 2, (x1 - x0) // 2)
    if r <= 0:
        draw.rectangle(bbox, fill=fill)
        return
    draw.rectangle([x0 + r, y0, x1 - r, y1], fill=fill)
    draw.rectangle([x0, y0 + r, x1, y1 - r], fill=fill)
    draw.pieslice([x0, y0, x0 + 2*r, y0 + 2*r], 180, 270, fill=fill)
    draw.pieslice([x1 - 2*r, y0, x1, y0 + 2*r], 270, 360, fill=fill)
    draw.pieslice([x0, y1 - 2*r, x0 + 2*r, y1], 90, 180, fill=fill)
    draw.pieslice([x1 - 2*r, y1 - 2*r, x1, y1], 0, 90, fill=fill)


def generate():
    img = Image.new("RGB", (W, H), CHARCOAL)
    draw = ImageDraw.Draw(img)

    font_tiny = get_font(10)
    font_small = get_font(11)
    font_med = get_font(13, bold=True)

    # Window chrome
    draw.rectangle([0, 0, W, 28], fill=(50, 50, 50))
    for i, color in enumerate([(255, 95, 87), (255, 189, 46), (39, 201, 63)]):
        cx = 16 + i * 22
        draw.ellipse([cx - 6, 8, cx + 6, 20], fill=color)
    draw.text((W // 2 - 60, 7), "Charmera Companion", fill=(120, 120, 120), font=font_small)

    # Top bar
    draw.rectangle([0, 28, W, 66], fill=CHARCOAL)
    # Back button
    draw.text((16, 42), "< Back", fill=(200, 200, 200), font=font_small)
    # Toggle buttons
    draw_rounded_rect(draw, [460, 38, 520, 56], 10, YELLOW)
    draw.text((472, 42), "Effects", fill=WHITE, font=font_tiny)
    draw_rounded_rect(draw, [530, 38, 570, 56], 10, (60, 60, 60))
    draw.text((540, 42), "Info", fill=(180, 180, 180), font=font_tiny)
    # Save Copy button
    draw_rounded_rect(draw, [580, 38, 680, 56], 10, (252, 194, 0, 200))
    draw.text((590, 42), "Export with Effects", fill=WHITE, font=font_tiny)
    # Counter
    draw.text((W - 80, 42), "3 / 36", fill=(120, 120, 120), font=font_small)

    # Main photo area
    photo_x, photo_y = 40, 76
    photo_w, photo_h = 680, 460
    # Simulate a warm-toned vintage photo
    for y_off in range(photo_h):
        r = 180 + int(20 * (y_off / photo_h))
        g = 140 + int(30 * (y_off / photo_h))
        b = 100 + int(20 * (y_off / photo_h))
        draw.line([photo_x, photo_y + y_off, photo_x + photo_w, photo_y + y_off], fill=(r, g, b))

    # Vintage overlay effect
    draw.text((photo_x + 20, photo_y + 20), "vintage + warm", fill=(255, 255, 255, 128), font=font_small)

    # Nav arrows (yellow)
    draw_rounded_rect(draw, [10, photo_y + photo_h // 2 - 20, 34, photo_y + photo_h // 2 + 20], 12, (252, 194, 0, 100))
    draw.text((16, photo_y + photo_h // 2 - 6), "<", fill=WHITE, font=font_med)
    draw_rounded_rect(draw, [photo_x + photo_w + 6, photo_y + photo_h // 2 - 20, photo_x + photo_w + 30, photo_y + photo_h // 2 + 20], 12, (252, 194, 0, 100))
    draw.text((photo_x + photo_w + 12, photo_y + photo_h // 2 - 6), ">", fill=WHITE, font=font_med)

    # Info panel (right side)
    info_x = photo_x + photo_w + 40
    info_w = W - info_x
    draw.rectangle([info_x, 66, W, 540], fill=BROWN)

    draw.text((info_x + 16, 80), "PHOTO INFO", fill=(200, 200, 200, 100), font=font_tiny)
    draw.text((info_x + 16, 100), "b 03-30 brown dog.jpg", fill=(220, 220, 220), font=font_small)
    draw.text((info_x + 16, 118), "1440 x 1080", fill=(140, 140, 140), font=font_tiny)
    draw.text((info_x + 16, 134), "2026-03-30 14:30", fill=(140, 140, 140), font=font_tiny)

    # AI Description
    draw.text((info_x + 16, 168), "AI DESCRIPTION", fill=YELLOW, font=font_tiny)
    draw.text((info_x + 16, 186), "A brown and white dog", fill=(200, 200, 200), font=font_small)
    draw.text((info_x + 16, 202), "sitting on a couch,", fill=(200, 200, 200), font=font_small)
    draw.text((info_x + 16, 218), "gazing at the camera.", fill=(200, 200, 200), font=font_small)

    # Tags
    draw.text((info_x + 16, 252), "TAGS", fill=YELLOW, font=font_tiny)
    tags = ["dog", "indoor", "couch", "pet"]
    tag_x = info_x + 16
    for tag in tags:
        tw = len(tag) * 7 + 16
        draw_rounded_rect(draw, [tag_x, 270, tag_x + tw, 288], 10, (252, 194, 0, 50))
        draw.text((tag_x + 8, 274), tag, fill=(252, 210, 100), font=font_tiny)
        tag_x += tw + 6

    # Effects panel (bottom)
    effects_y = 546
    draw.rectangle([0, effects_y, W, effects_y + 80], fill=BROWN)

    draw.text((16, effects_y + 8), "EFFECTS", fill=(160, 160, 160), font=font_tiny)
    draw.text((80, effects_y + 8), "Clear all", fill=(200, 80, 80), font=font_tiny)
    draw.text((160, effects_y + 8), "Reapply last", fill=YELLOW, font=font_tiny)

    effects = ["vintage", "noir", "faded", "warm", "cool", "sharp", "soft", "vignette", "grain", "light leak"]
    active = {"vintage", "warm"}
    ex = 16
    for eff in effects:
        ew = len(eff) * 7 + 20
        color = YELLOW if eff in active else (60, 60, 60)
        text_color = WHITE if eff in active else (160, 160, 160)
        draw_rounded_rect(draw, [ex, effects_y + 26, ex + ew, effects_y + 46], 8, color)
        draw.text((ex + 10, effects_y + 30), eff, fill=text_color, font=font_tiny)
        ex += ew + 6

    draw.text((16, effects_y + 54), "FRAMES", fill=(160, 160, 160), font=font_tiny)
    frames = ["simple", "polaroid", "film strip", "rounded"]
    fx = 16
    for fr in frames:
        fw = len(fr) * 7 + 20
        draw_rounded_rect(draw, [fx, effects_y + 68, fx + fw, effects_y + 88 if effects_y + 88 < H else H - 2], 8, (60, 60, 60))
        draw.text((fx + 10, effects_y + 72 if effects_y + 72 < H - 10 else H - 12), fr, fill=(160, 160, 160), font=font_tiny)
        fx += fw + 6

    # Film strip at bottom
    strip_y = H - 80
    draw.rectangle([0, strip_y, W, strip_y + 80], fill=FILM_BORDER)
    # Thumbnail filmstrip
    thumb_x = 16
    for i in range(14):
        color_base = 100 + (i * 23) % 80
        thumb_color = (color_base + 40, color_base + 20, color_base)
        active_border = YELLOW if i == 2 else (40, 40, 40)
        draw.rectangle([thumb_x - 2, strip_y + 10 - 2, thumb_x + 60 + 2, strip_y + 60 + 2], fill=active_border)
        draw.rectangle([thumb_x, strip_y + 10, thumb_x + 60, strip_y + 60], fill=thumb_color)
        thumb_x += 68

    # Border
    draw.rectangle([0, 0, W - 1, H - 1], outline=(80, 80, 80))

    output = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "screenshot-detail.png")
    img.save(output, "PNG")
    print(f"Detail mockup saved to {output}")


if __name__ == "__main__":
    generate()
