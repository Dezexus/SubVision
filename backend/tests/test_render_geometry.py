import numpy as np
import pytest

from subvision.rendering.geometry import (
    calculate_blur_roi,
    calculate_text_roi,
    compute_feather_inner_roi,
)
from subvision.rendering.effects.blur import _get_cached_mask, apply_blur_to_frame
from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint, generate_text_mask


SETTINGS = {
    "y": 900,
    "font_size": 30,
    "sigma": 8,
    "feather": 40,
    "width_multiplier": 1.0,
    "height_multiplier": 1.2,
}


@pytest.mark.parametrize("text", ["Hello world", "Preview Text Size", "Длинный текст субтитров"])
def test_blur_roi_equals_text_roi(text):
    width, height = 1920, 1080
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    blur_roi = calculate_blur_roi(text, width, height, SETTINGS)
    assert blur_roi == text_roi


def test_feather_inner_roi_stays_inside_text_roi():
    text_roi = (100, 800, 400, 60)
    inner = compute_feather_inner_roi(text_roi, feather=40)
    bx, by, bw, bh = text_roi
    ix, iy, iw, ih = inner
    assert ix >= bx
    assert iy >= by
    assert ix + iw <= bx + bw
    assert iy + ih <= by + bh


def test_feather_mask_within_roi_bounds():
    bw, bh = 200, 50
    feather = 20
    inset = feather // 2
    mask = _get_cached_mask(bw, bh, feather, inset, inset, bw - 2 * inset, bh - 2 * inset)
    assert mask.shape == (bh, bw)
    assert mask.min() >= 0.0
    assert mask.max() <= 1.0 + 1e-5


def test_apply_blur_does_not_modify_outside_text_roi():
    width, height = 640, 360
    text = "Sample subtitle"
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    bx, by, bw, bh = text_roi
    assert bw > 0 and bh > 0

    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    original = frame.copy()
    inner = compute_feather_inner_roi(text_roi, SETTINGS["feather"])

    result = apply_blur_to_frame(frame, text_roi, SETTINGS, 1.0, inner)

    outside_mask = np.ones((height, width), dtype=bool)
    outside_mask[by : by + bh, bx : bx + bw] = False
    assert np.array_equal(result[outside_mask], original[outside_mask])


def test_generate_text_mask_matches_roi_size():
    height, width = 360, 640
    roi = (200, 300, 150, 40)
    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    mask = generate_text_mask(frame, roi, font_size_px=30)
    bx, by, bw, bh = roi
    assert mask.shape == (bh, bw)


def test_hybrid_inpaint_does_not_modify_outside_text_roi():
    width, height = 640, 360
    text = "Sample subtitle"
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    bx, by, bw, bh = text_roi
    assert bw > 0 and bh > 0

    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    original = frame.copy()

    result = _apply_hybrid_inpaint(frame, text_roi, font_size_px=SETTINGS["font_size"])

    outside_mask = np.ones((height, width), dtype=bool)
    outside_mask[by : by + bh, bx : bx + bw] = False
    assert np.array_equal(result[outside_mask], original[outside_mask])
