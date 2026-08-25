import numpy as np
import pytest

from subvision.rendering.geometry import (
    build_edge_fade_mask,
    build_soft_core_mask,
    calculate_blur_roi,
    calculate_text_roi,
    core_relative_to_blur,
)
from subvision.rendering.effects.blur import build_effect_mask, apply_blur_to_frame
from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint, generate_text_mask
from subvision.rendering.blend import pyramid_blend


SETTINGS = {
    "y": 900,
    "font_size": 30,
    "sigma": 8,
    "feather": 40,
    "width_multiplier": 1.0,
    "height_multiplier": 1.2,
}


@pytest.mark.parametrize("text", ["Hello world", "Preview Text Size", "Длинный текст субтитров"])
def test_blur_roi_contains_text_roi(text):
    width, height = 1920, 1080
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    blur_roi = calculate_blur_roi(text, width, height, SETTINGS)
    tx, ty, tw, th = text_roi
    bx, by, bw, bh = blur_roi
    assert bx <= tx
    assert by <= ty
    assert bx + bw >= tx + tw
    assert by + bh >= ty + th
    assert bw > tw or bh > th  # pad expands at least one axis when room exists


def test_soft_core_mask_full_inside_and_zero_on_pad_edge():
    bw, bh = 200, 80
    core = (40, 20, 120, 40)
    feather = 30
    mask = build_soft_core_mask(bw, bh, core, feather)
    assert mask.shape == (bh, bw)
    assert float(mask[40, 100]) > 0.9
    assert float(mask[0, :].max()) == pytest.approx(0.0, abs=1e-5)
    assert float(mask[-1, :].max()) == pytest.approx(0.0, abs=1e-5)


def test_edge_fade_mask_zero_on_perimeter():
    mask = build_edge_fade_mask(200, 50, 20)
    assert float(mask[0, :].max()) == pytest.approx(0.0, abs=1e-6)
    assert float(mask[:, 0].max()) == pytest.approx(0.0, abs=1e-6)


def test_effect_mask_uses_soft_core():
    mask = build_effect_mask(160, 60, (30, 15, 100, 30), feather=24, alpha=1.0)
    assert float(mask[0, :].max()) == pytest.approx(0.0, abs=1e-5)
    assert float(mask[30, 80]) > float(mask[5, 80])


def test_pyramid_blend_respects_mask():
    h, w = 64, 128
    original = np.zeros((h, w, 3), dtype=np.uint8)
    processed = np.full((h, w, 3), 255, dtype=np.uint8)
    mask = np.zeros((h, w), dtype=np.float32)
    mask[16:48, 32:96] = 1.0
    out = pyramid_blend(original, processed, mask, max_levels=3)
    assert out[32, 64].mean() > 200
    assert out[0, 0].mean() < 30


def test_apply_blur_does_not_modify_outside_blur_roi():
    width, height = 640, 360
    text = "Sample subtitle"
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    blur_roi = calculate_blur_roi(text, width, height, SETTINGS)
    bx, by, bw, bh = blur_roi
    assert bw > 0 and bh > 0

    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    original = frame.copy()

    result = apply_blur_to_frame(frame, blur_roi, SETTINGS, 1.0, text_roi=text_roi)

    outside = np.ones((height, width), dtype=bool)
    outside[by : by + bh, bx : bx + bw] = False
    assert np.array_equal(result[outside], original[outside])


def test_apply_blur_preserves_blur_roi_perimeter():
    width, height = 640, 360
    text = "Sample subtitle"
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    blur_roi = calculate_blur_roi(text, width, height, SETTINGS)
    bx, by, bw, bh = blur_roi

    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    original = frame.copy()
    result = apply_blur_to_frame(frame, blur_roi, SETTINGS, 1.0, text_roi=text_roi)

    border = result[by : by + bh, bx : bx + bw]
    orig = original[by : by + bh, bx : bx + bw]
    # Perimeter of padded ROI should stay (almost) original — soft mask ~ 0.
    assert np.mean(np.abs(border[0, :].astype(int) - orig[0, :].astype(int))) < 2.0
    assert np.mean(np.abs(border[-1, :].astype(int) - orig[-1, :].astype(int))) < 2.0


def test_hybrid_inpaint_does_not_modify_outside_blur_roi():
    width, height = 640, 360
    text = "Sample subtitle"
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    blur_roi = calculate_blur_roi(text, width, height, SETTINGS)
    bx, by, bw, bh = blur_roi

    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    original = frame.copy()
    result = _apply_hybrid_inpaint(frame, text_roi, SETTINGS, blur_roi)

    outside = np.ones((height, width), dtype=bool)
    outside[by : by + bh, bx : bx + bw] = False
    assert np.array_equal(result[outside], original[outside])


def test_generate_text_mask_matches_roi_size():
    height, width = 360, 640
    roi = (200, 300, 150, 40)
    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    mask = generate_text_mask(frame, roi, font_size_px=30)
    assert mask.shape == (40, 150)


def test_core_relative_helper():
    text_roi = (100, 200, 80, 30)
    blur_roi = (80, 180, 120, 70)
    assert core_relative_to_blur(text_roi, blur_roi) == (20, 20, 80, 30)
