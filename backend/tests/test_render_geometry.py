import numpy as np
import pytest
import cv2

from subvision.rendering.geometry import (
    calculate_blur_roi,
    calculate_text_roi,
    compute_feather_inner_roi,
)
from subvision.rendering.effects.blur import _get_cached_mask, apply_blur_to_frame
from subvision.rendering.effects.inpainting import (
    _apply_hybrid_inpaint,
    generate_text_mask,
    tight_box_from_mask,
)


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


def test_tight_box_from_mask_shrinks_roi():
    roi = (100, 200, 200, 80)
    mask = np.zeros((80, 200), dtype=np.uint8)
    mask[20:40, 50:150] = 255
    tight, cropped = tight_box_from_mask(mask, roi, pad=2)
    tx, ty, tw, th = tight
    assert tw < 200
    assert th < 80
    assert cropped.shape == (th, tw)
    assert tx >= 100 and ty >= 200


def test_tight_box_keep_height_only_shrinks_width():
    roi = (100, 200, 200, 80)
    mask = np.zeros((80, 200), dtype=np.uint8)
    mask[20:40, 50:150] = 255
    tight, cropped = tight_box_from_mask(mask, roi, pad=2, keep_height=True)
    tx, ty, tw, th = tight
    assert tw < 200
    assert th == 80
    assert ty == 200
    assert cropped.shape == (th, tw)


def test_band_blur_alpha_fades_at_vertical_edges():
    from subvision.rendering.effects.inpainting import _band_blur_alpha

    h, w, font = 120, 400, 28
    pad_y = max(20, int(font * 1.4))
    alpha = _band_blur_alpha(h, w, font, None, pad_y=pad_y)
    assert alpha.shape == (h, w)
    assert float(alpha.max()) > 0.5
    # Top/bottom rows must dissolve into the frame (no hard rectangle).
    assert float(alpha[0].max()) < 0.12
    assert float(alpha[-1].max()) < 0.12
    assert float(alpha[h // 2, w // 2]) > float(alpha[2, w // 2])


def test_generate_text_mask_covers_white_text_with_dark_outline():
    """White glyphs + dark halo must yield a non-empty mask that covers the outline."""
    height, width = 200, 640
    frame = np.full((height, width, 3), 80, dtype=np.uint8)
    roi = (40, 70, 560, 60)
    bx, by, bw, bh = roi
    # Dark outline rectangle then white fill (simulates outlined hardsub).
    cv2.rectangle(frame, (bx + 40, by + 12), (bx + bw - 40, by + bh - 12), (20, 20, 20), 4)
    cv2.putText(
        frame,
        "Hello World",
        (bx + 60, by + 42),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.1,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    mask = generate_text_mask(frame, roi, font_size_px=30)
    assert mask.shape == (bh, bw)
    assert cv2.countNonZero(mask) > 200
    # Outline pixels near the dark stroke should be marked after dilate.
    outline_strip = mask[8:16, 80:bw - 80]
    assert cv2.countNonZero(outline_strip) > 0


def test_hybrid_always_modifies_pixels_inside_roi():
    """Anti no-op: active cue ROI must change even with a weak/empty stroke mask."""
    width, height = 640, 360
    text = "Sample subtitle"
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    bx, by, bw, bh = text_roi
    assert bw > 0 and bh > 0

    frame = np.random.randint(40, 200, (height, width, 3), dtype=np.uint8)
    # Paint obvious white subtitle into the ROI so inpaint+band blur has work.
    cv2.putText(
        frame,
        "SUBTITLE",
        (bx + 10, by + bh // 2 + 8),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    original = frame.copy()
    result = _apply_hybrid_inpaint(
        frame,
        text_roi,
        font_size_px=SETTINGS["font_size"],
        apply_residual_blur=True,
        blur_settings=SETTINGS,
    )
    inside = result[by : by + bh, bx : bx + bw]
    orig_inside = original[by : by + bh, bx : bx + bw]
    assert not np.array_equal(inside, orig_inside)


def test_hybrid_empty_mask_still_applies_band_blur():
    width, height = 640, 360
    roi = (100, 280, 400, 50)
    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    original = frame.copy()
    empty = np.zeros((roi[3], roi[2]), dtype=np.uint8)
    result = _apply_hybrid_inpaint(
        frame,
        roi,
        font_size_px=30,
        mask=empty,
        apply_residual_blur=True,
        blur_settings=SETTINGS,
    )
    bx, by, bw, bh = roi
    assert not np.array_equal(result[by : by + bh, bx : bx + bw], original[by : by + bh, bx : bx + bw])
    # Feather may extend outside the geometric ROI; far field must stay intact.
    pad_y = max(20, int(30 * 1.4))
    pad_x = max(12, int(30 * 0.5))
    y0 = max(0, by - pad_y)
    y1 = min(height, by + bh + pad_y)
    x0 = max(0, bx - pad_x)
    x1 = min(width, bx + bw + pad_x)
    outside = np.ones((height, width), dtype=bool)
    outside[y0:y1, x0:x1] = False
    assert np.array_equal(result[outside], original[outside])


def test_hybrid_inpaint_does_not_modify_far_outside_expanded_roi():
    width, height = 640, 360
    text = "Sample subtitle"
    text_roi = calculate_text_roi(text, width, height, SETTINGS)
    bx, by, bw, bh = text_roi
    assert bw > 0 and bh > 0

    frame = np.random.randint(0, 256, (height, width, 3), dtype=np.uint8)
    original = frame.copy()

    result = _apply_hybrid_inpaint(
        frame,
        text_roi,
        font_size_px=SETTINGS["font_size"],
        apply_residual_blur=True,
        blur_settings=SETTINGS,
    )

    font = SETTINGS["font_size"]
    pad_y = max(20, int(font * 1.4))
    pad_x = max(12, int(font * 0.5))
    y0 = max(0, by - pad_y)
    y1 = min(height, by + bh + pad_y)
    x0 = max(0, bx - pad_x)
    x1 = min(width, bx + bw + pad_x)
    outside_mask = np.ones((height, width), dtype=bool)
    outside_mask[y0:y1, x0:x1] = False
    assert np.array_equal(result[outside_mask], original[outside_mask])
