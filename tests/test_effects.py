"""Tests for the effects module."""

from pathlib import Path

import pytest
from PIL import Image

from kodak_helper.effects import (
    EFFECTS,
    FRAMES,
    apply_effects,
    cool,
    faded,
    frame_film_strip,
    frame_polaroid,
    frame_rounded,
    frame_simple,
    noir,
    sharp,
    soft,
    vignette,
    vintage,
    warm,
)


@pytest.fixture
def sample_photo(tmp_path):
    """Create a test photo."""
    img = Image.new("RGB", (1440, 1080), color=(180, 120, 80))
    path = tmp_path / "photo.jpg"
    img.save(str(path))
    return path


@pytest.fixture
def sample_image():
    """Create an in-memory test image."""
    return Image.new("RGB", (400, 300), color=(180, 120, 80))


class TestEffects:
    """Test each effect returns a valid RGB image."""

    def test_vintage(self, sample_image):
        result = vintage(sample_image)
        assert result.mode == "RGB"
        assert result.size == sample_image.size

    def test_noir(self, sample_image):
        result = noir(sample_image)
        assert result.mode == "RGB"
        assert result.size == sample_image.size

    def test_faded(self, sample_image):
        result = faded(sample_image)
        assert result.mode == "RGB"

    def test_warm(self, sample_image):
        result = warm(sample_image)
        assert result.mode == "RGB"

    def test_cool(self, sample_image):
        result = cool(sample_image)
        assert result.mode == "RGB"

    def test_sharp(self, sample_image):
        result = sharp(sample_image)
        assert result.size == sample_image.size

    def test_soft(self, sample_image):
        result = soft(sample_image)
        assert result.size == sample_image.size

    def test_vignette(self, sample_image):
        result = vignette(sample_image)
        assert result.mode == "RGB"
        assert result.size == sample_image.size


class TestFrames:
    """Test each frame returns a valid image (possibly larger)."""

    def test_frame_simple(self, sample_image):
        result = frame_simple(sample_image)
        assert result.mode == "RGB"
        assert result.width > sample_image.width
        assert result.height > sample_image.height

    def test_frame_polaroid(self, sample_image):
        result = frame_polaroid(sample_image)
        assert result.mode == "RGB"
        assert result.height > sample_image.height + 80  # thick bottom

    def test_frame_film_strip(self, sample_image):
        result = frame_film_strip(sample_image)
        assert result.mode == "RGB"
        assert result.width > sample_image.width

    def test_frame_rounded(self, sample_image):
        result = frame_rounded(sample_image)
        assert result.mode == "RGB"

    def test_frame_simple_custom_color(self, sample_image):
        result = frame_simple(sample_image, border=20, color=(0, 0, 0))
        assert result.mode == "RGB"
        # Check corner pixel is black
        assert result.getpixel((0, 0)) == (0, 0, 0)


class TestEffectsDoNotMutate:
    """Verify effects return new images without mutating originals."""

    def test_vintage_immutable(self, sample_image):
        original_data = list(sample_image.getdata())
        vintage(sample_image)
        assert list(sample_image.getdata()) == original_data

    def test_noir_immutable(self, sample_image):
        original_data = list(sample_image.getdata())
        noir(sample_image)
        assert list(sample_image.getdata()) == original_data


class TestApplyEffects:
    """Test the apply_effects pipeline."""

    def test_single_effect(self, sample_photo, tmp_path):
        out = tmp_path / "out.jpg"
        apply_effects(sample_photo, out, effects=["vintage"])
        assert out.exists()

    def test_multiple_effects(self, sample_photo, tmp_path):
        out = tmp_path / "out.jpg"
        apply_effects(sample_photo, out, effects=["warm", "sharp"])
        assert out.exists()

    def test_frame_only(self, sample_photo, tmp_path):
        out = tmp_path / "out.jpg"
        apply_effects(sample_photo, out, frame="polaroid")
        assert out.exists()

    def test_effects_and_frame(self, sample_photo, tmp_path):
        out = tmp_path / "out.jpg"
        apply_effects(sample_photo, out, effects=["vintage"], frame="film_strip")
        assert out.exists()

    def test_unknown_effect_raises(self, sample_photo, tmp_path):
        out = tmp_path / "out.jpg"
        with pytest.raises(ValueError, match="Unknown effect"):
            apply_effects(sample_photo, out, effects=["nonexistent"])

    def test_unknown_frame_raises(self, sample_photo, tmp_path):
        out = tmp_path / "out.jpg"
        with pytest.raises(ValueError, match="Unknown frame"):
            apply_effects(sample_photo, out, frame="nonexistent")


class TestRegistry:
    """Test effect and frame registries are complete."""

    def test_all_effects_registered(self):
        expected = {"vintage", "noir", "faded", "warm", "cool", "sharp",
                    "soft", "vignette", "grain", "light_leak"}
        assert set(EFFECTS.keys()) == expected

    def test_all_frames_registered(self):
        expected = {"simple", "polaroid", "film_strip", "rounded"}
        assert set(FRAMES.keys()) == expected
