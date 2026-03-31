#!/usr/bin/env python3.11
"""Generate a 1280x640 social preview image for GitHub repo."""

from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1280, 640

YELLOW = (252, 194, 0)
RED = (196, 30, 58)
CHARCOAL = (28, 28, 28)
WHITE = (255, 255, 255)
CREAM = (250, 246, 240)
BLUE = (0, 61, 165)
ORANGE = (232, 125, 30)
PURPLE = (61, 31, 110)
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


def generate():
    img = Image.new("RGB", (W, H), YELLOW)
    draw = ImageDraw.Draw(img)

    # Rainbow stripe across top
    stripe_h = 10
    seg_w = W // len(STRIPE_COLORS)
    for i, color in enumerate(STRIPE_COLORS):
        draw.rectangle([i * seg_w, 0, (i + 1) * seg_w, stripe_h], fill=color)

    # App icon (from file)
    icon_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                             "crates", "charmera-app", "icons", "icon.png")
    if os.path.exists(icon_path):
        icon = Image.open(icon_path).resize((160, 160), Image.LANCZOS)
        img.paste(icon, (80, 100))

    # Title text
    font_title = get_font(72, bold=True)
    font_sub = get_font(28)
    font_small = get_font(20)
    font_tag = get_font(18, bold=True)

    draw.text((280, 110), "Charmera", fill=WHITE, font=font_title)
    draw.text((280, 190), "Companion", fill=WHITE, font=font_title)

    # Tagline
    draw.text((280, 280), "Photo organizer with local AI", fill=CHARCOAL, font=font_sub)
    draw.text((280, 315), "for KODAK CHARMERA keychain cameras", fill=CHARCOAL, font=font_sub)

    # Feature pills
    features = ["Auto Import", "AI Label", "Smart Rename", "10 Effects", "No Cloud"]
    pill_x = 80
    pill_y = 420
    for feat in features:
        bbox = draw.textbbox((0, 0), feat, font=font_tag)
        pw = bbox[2] - bbox[0] + 24
        draw_rounded_rect(draw, [pill_x, pill_y, pill_x + pw, pill_y + 36], 18, CHARCOAL)
        draw.text((pill_x + 12, pill_y + 7), feat, fill=YELLOW, font=font_tag)
        pill_x += pw + 12

    # Tech badges
    techs = ["Rust", "Tauri 2", "Solid.js", "Ollama"]
    tx = 80
    ty = 480
    for tech in techs:
        bbox = draw.textbbox((0, 0), tech, font=font_small)
        tw = bbox[2] - bbox[0]
        draw.text((tx, ty), tech, fill=(100, 80, 0), font=font_small)
        tx += tw + 30

    # "Kodak" branding
    draw.text((80, 550), "Kodak", fill=RED, font=get_font(24, bold=True))
    draw.text((155, 553), "Charmera 1987", fill=CHARCOAL, font=get_font(20))

    # Bottom stripe
    for i, color in enumerate(STRIPE_COLORS):
        draw.rectangle([i * seg_w, H - stripe_h, (i + 1) * seg_w, H], fill=color)

    # GitHub URL
    draw.text((W - 400, H - 40), "github.com/h3qing/Kodak-Charmera-Companion", fill=(100, 80, 0), font=get_font(14))

    # Save
    output = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "social-preview.png")
    img.save(output, "PNG")
    print(f"Social preview saved to {output} ({W}x{H})")


if __name__ == "__main__":
    generate()
