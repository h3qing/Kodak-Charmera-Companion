"""Import photos from camera with smart renaming.

Rename format: mm-dd-yyyy content.ext
Example: 03-29-2026 dog 001.jpg
"""

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import shutil

from PIL import Image
from PIL.ExifTags import Base as ExifBase

from .constants import (
    ALL_MEDIA_EXTENSIONS,
    DATE_FORMAT_EXIF,
    DATE_FORMAT_FILENAME,
    DCIM_DIR,
    PHOTO_EXTENSIONS,
    VIDEO_EXTENSIONS,
    VOLUME_PATHS,
)


@dataclass(frozen=True)
class ImportedFile:
    """Record of a single imported file."""

    source: Path
    destination: Path
    original_name: str
    new_name: str


def find_camera() -> Path | None:
    """Auto-detect camera mount point."""
    for vol in VOLUME_PATHS:
        dcim = vol / DCIM_DIR
        if dcim.is_dir():
            return vol
    return None


def find_camera_or_raise(camera_path: str | None = None) -> Path:
    """Find camera path, raising if not found."""
    if camera_path:
        path = Path(camera_path)
        if not path.exists():
            raise FileNotFoundError(f"Camera path not found: {camera_path}")
        return path

    found = find_camera()
    if found is None:
        raise FileNotFoundError(
            "Camera not detected. Connect camera or specify path with --source"
        )
    return found


def _extract_date_from_exif(filepath: Path) -> datetime | None:
    """Pull capture date from EXIF data."""
    try:
        with Image.open(filepath) as img:
            exif = img.getexif()
            if not exif:
                return None
            raw = exif.get(ExifBase.DateTime)
            if raw:
                return datetime.strptime(raw.strip(), DATE_FORMAT_EXIF)
    except Exception:
        pass
    return None


def _extract_date_from_stat(filepath: Path) -> datetime:
    """Fall back to file modification time."""
    return datetime.fromtimestamp(filepath.stat().st_mtime)


def _get_date(filepath: Path) -> datetime:
    """Get best available date for a media file."""
    return _extract_date_from_exif(filepath) or _extract_date_from_stat(filepath)


def _media_type_label(filepath: Path) -> str:
    """Determine default content label from file type."""
    ext = filepath.suffix.lower()
    if ext in PHOTO_EXTENSIONS:
        return "photo"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    return "file"


def _build_new_name(
    filepath: Path,
    label: str | None,
    counter: int,
) -> str:
    """Build filename in mm-dd-yyyy content NNN.ext format."""
    date = _get_date(filepath)
    date_str = date.strftime(DATE_FORMAT_FILENAME)
    content = label or _media_type_label(filepath)
    ext = filepath.suffix.lower()
    return f"{date_str} {content} {counter:03d}{ext}"


def _resolve_destination(dest_dir: Path, new_name: str) -> Path:
    """Ensure no filename collisions."""
    target = dest_dir / new_name
    if not target.exists():
        return target

    stem = target.stem
    ext = target.suffix
    n = 1
    while target.exists():
        target = dest_dir / f"{stem}_{n}{ext}"
        n += 1
    return target


def list_media_files(source: Path) -> list[Path]:
    """Find all media files on the camera."""
    dcim = source / DCIM_DIR
    if not dcim.is_dir():
        dcim = source  # allow pointing directly at a folder of images

    files = []
    for f in sorted(dcim.iterdir()):
        if f.suffix.lower() in ALL_MEDIA_EXTENSIONS and not f.name.startswith("."):
            files.append(f)
    return files


def import_files(
    source: Path,
    dest_dir: Path,
    label: str | None = None,
    move: bool = False,
) -> list[ImportedFile]:
    """Import media files from camera to destination with smart renaming.

    Args:
        source: Camera mount path (containing DCIM/)
        dest_dir: Where to copy files to
        label: Content label for filenames (e.g. "dog", "sunset")
        move: Move instead of copy

    Returns:
        List of ImportedFile records
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    files = list_media_files(source)

    if not files:
        return []

    results = []
    for counter, filepath in enumerate(files, start=1):
        new_name = _build_new_name(filepath, label, counter)
        destination = _resolve_destination(dest_dir, new_name)

        if move:
            shutil.move(str(filepath), str(destination))
        else:
            shutil.copy2(str(filepath), str(destination))

        results = [
            *results,
            ImportedFile(
                source=filepath,
                destination=destination,
                original_name=filepath.name,
                new_name=destination.name,
            ),
        ]

    return results
