"""Tests for the splash screen module."""

from pathlib import Path

import pytest
from PIL import Image

from kodak_helper.constants import SPLASH_DIR, SPLASH_FILE, SPLASH_HEIGHT, SPLASH_WIDTH
from kodak_helper.splash import _resize_and_crop, create_splash, install_splash


@pytest.fixture
def sample_image(tmp_path):
    """Create a sample image for testing."""
    img = Image.new("RGB", (1920, 1080), color=(255, 100, 50))
    path = tmp_path / "sample.jpg"
    img.save(str(path))
    return path


@pytest.fixture
def tall_image(tmp_path):
    """Create a tall portrait image."""
    img = Image.new("RGB", (600, 1200), color=(50, 100, 255))
    path = tmp_path / "tall.jpg"
    img.save(str(path))
    return path


def test_resize_and_crop_landscape():
    img = Image.new("RGB", (1920, 1080))
    result = _resize_and_crop(img, SPLASH_WIDTH, SPLASH_HEIGHT)
    assert result.size == (SPLASH_WIDTH, SPLASH_HEIGHT)


def test_resize_and_crop_portrait():
    img = Image.new("RGB", (600, 1200))
    result = _resize_and_crop(img, SPLASH_WIDTH, SPLASH_HEIGHT)
    assert result.size == (SPLASH_WIDTH, SPLASH_HEIGHT)


def test_resize_and_crop_square():
    img = Image.new("RGB", (500, 500))
    result = _resize_and_crop(img, SPLASH_WIDTH, SPLASH_HEIGHT)
    assert result.size == (SPLASH_WIDTH, SPLASH_HEIGHT)


def test_create_splash_dimensions(sample_image, tmp_path):
    output = tmp_path / "splash.jpg"
    create_splash(sample_image, output_path=output)

    with Image.open(output) as img:
        assert img.size == (SPLASH_WIDTH, SPLASH_HEIGHT)
        assert img.mode == "RGB"


def test_create_splash_with_text(sample_image, tmp_path):
    output = tmp_path / "splash_text.jpg"
    create_splash(sample_image, output_path=output, text="Hello Camera!")

    assert output.exists()
    with Image.open(output) as img:
        assert img.size == (SPLASH_WIDTH, SPLASH_HEIGHT)


def test_create_splash_baseline_jpeg(sample_image, tmp_path):
    output = tmp_path / "splash.jpg"
    create_splash(sample_image, output_path=output)

    with Image.open(output) as img:
        # Baseline JPEG should not be progressive
        assert not img.info.get("progressive", False)


def test_install_splash(sample_image, tmp_path):
    camera = tmp_path / "camera"
    camera.mkdir()

    dest = install_splash(sample_image, camera)

    assert dest == camera / SPLASH_DIR / SPLASH_FILE
    assert dest.exists()

    with Image.open(dest) as img:
        assert img.size == (SPLASH_WIDTH, SPLASH_HEIGHT)


def test_install_splash_creates_spidcim(sample_image, tmp_path):
    camera = tmp_path / "camera"
    camera.mkdir()

    install_splash(sample_image, camera)

    assert (camera / SPLASH_DIR).is_dir()
