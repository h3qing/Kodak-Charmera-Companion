"""Camera constants and defaults."""

from pathlib import Path

# Generalplus CBB3 camera specs
SPLASH_WIDTH = 960
SPLASH_HEIGHT = 720
SPLASH_DIR = "SPIDCIM"
SPLASH_FILE = "SPI00.jpg"

PHOTO_WIDTH = 1440
PHOTO_HEIGHT = 1080

DCIM_DIR = "DCIM"

# File patterns
PHOTO_EXTENSIONS = frozenset({".jpg", ".jpeg"})
VIDEO_EXTENSIONS = frozenset({".avi"})
ALL_MEDIA_EXTENSIONS = PHOTO_EXTENSIONS | VIDEO_EXTENSIONS

# Default mount points to search
VOLUME_PATHS = (
    Path("/Volumes/SDCARD"),
    Path("/Volumes/CAMERA"),
    Path("/Volumes/KODAK"),
    Path("/Volumes/CHARMERA"),
)

# Renaming
DATE_FORMAT_EXIF = "%Y:%m:%d:%H:%M:%S"
DATE_FORMAT_FILENAME = "%m-%d-%Y"

# Effects
DEFAULT_JPEG_QUALITY = 92
SPLASH_JPEG_QUALITY = 85
