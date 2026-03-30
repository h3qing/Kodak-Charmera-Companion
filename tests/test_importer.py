"""Tests for the importer module."""

from datetime import datetime
from pathlib import Path

import pytest
from PIL import Image

from kodak_helper.importer import (
    _build_new_name,
    _media_type_label,
    import_files,
    list_media_files,
)


@pytest.fixture
def camera_dir(tmp_path):
    """Create a fake camera directory structure."""
    dcim = tmp_path / "DCIM"
    dcim.mkdir()

    # Create test photos with EXIF
    for i in range(3):
        img = Image.new("RGB", (1440, 1080), color=(100 + i * 50, 80, 60))
        path = dcim / f"PICT{i:04d}.jpg"
        img.save(str(path), format="JPEG")

    return tmp_path


@pytest.fixture
def output_dir(tmp_path):
    return tmp_path / "output"


def test_list_media_files(camera_dir):
    files = list_media_files(camera_dir)
    assert len(files) == 3
    assert all(f.suffix == ".jpg" for f in files)


def test_list_media_files_empty(tmp_path):
    (tmp_path / "DCIM").mkdir()
    files = list_media_files(tmp_path)
    assert files == []


def test_list_media_files_skips_dotfiles(camera_dir):
    dcim = camera_dir / "DCIM"
    (dcim / "._PICT0000.jpg").touch()
    files = list_media_files(camera_dir)
    assert all(not f.name.startswith(".") for f in files)


def test_media_type_label():
    assert _media_type_label(Path("test.jpg")) == "photo"
    assert _media_type_label(Path("test.jpeg")) == "photo"
    assert _media_type_label(Path("test.avi")) == "video"
    assert _media_type_label(Path("test.txt")) == "file"


def test_build_new_name_with_label(tmp_path):
    img = Image.new("RGB", (100, 100))
    path = tmp_path / "test.jpg"
    img.save(str(path))

    name = _build_new_name(path, "dog", 1)
    # Format: mm-dd-yyyy label NNN.ext
    assert "dog 001.jpg" in name
    assert len(name.split("-")[0]) == 2  # mm


def test_build_new_name_without_label(tmp_path):
    img = Image.new("RGB", (100, 100))
    path = tmp_path / "test.jpg"
    img.save(str(path))

    name = _build_new_name(path, None, 5)
    assert "photo 005.jpg" in name


def test_import_files_copies(camera_dir, output_dir):
    results = import_files(camera_dir, output_dir, label="test")

    assert len(results) == 3
    assert output_dir.exists()

    # Originals still exist (copy, not move)
    dcim = camera_dir / "DCIM"
    assert len(list(dcim.glob("PICT*.jpg"))) == 3

    # New files exist with correct naming
    for r in results:
        assert r.destination.exists()
        assert "test" in r.new_name


def test_import_files_moves(camera_dir, output_dir):
    results = import_files(camera_dir, output_dir, label="snap", move=True)

    assert len(results) == 3

    # Originals are gone
    dcim = camera_dir / "DCIM"
    assert len(list(dcim.glob("PICT*.jpg"))) == 0


def test_import_files_no_media(tmp_path, output_dir):
    (tmp_path / "DCIM").mkdir()
    results = import_files(tmp_path, output_dir)
    assert results == []


def test_import_files_collision_handling(camera_dir, output_dir):
    # Import twice to test collision handling
    import_files(camera_dir, output_dir, label="x")
    results = import_files(camera_dir, output_dir, label="x")

    assert len(results) == 3
    # Second import should have _1 suffix or similar
    names = [r.new_name for r in results]
    assert len(set(names)) == 3  # all unique
