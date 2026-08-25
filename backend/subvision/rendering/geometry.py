import math
import re
from typing import Tuple, Dict, Any

import numpy as np


def estimate_text_width(text: str, font_size: int, width_multiplier: float) -> int:
    """Calculate the approximate width of a text string in pixels."""
    if not text:
        return 0

    width = 0.0
    for char in text:
        if re.match(r"[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]", char):
            width += 1.1
        elif re.match(r"[mwWM@OQG]", char):
            width += 0.95
        elif re.match(r"[A-Z]", char):
            width += 0.8
        elif re.match(r"[0-9]", char):
            width += 0.65
        elif re.match(r"[il1.,!I|:;tfj]", char):
            width += 0.35
        else:
            width += 0.65

    return int(math.ceil(width * font_size * width_multiplier))


def calculate_text_roi(text: str, width: int, height: int, settings: Dict[str, Any]) -> Tuple[int, int, int, int]:
    """Calculate the coordinates of the text base rectangle (green area)."""
    if not text:
        return 0, 0, 0, 0

    y_pos = int(settings.get("y", height - 50))
    if y_pos > height:
        y_pos = height - 50

    font_size_px = int(settings.get("font_size", 21))
    width_multiplier = float(settings.get("width_multiplier", 1.0))
    height_multiplier = float(settings.get("height_multiplier", 1.0))

    lines = text.split("\n")
    max_line_width = 0
    for line in lines:
        line_width = estimate_text_width(line, font_size_px, width_multiplier)
        if line_width > max_line_width:
            max_line_width = line_width
    num_lines = len(lines)

    text_h = int((font_size_px + 4) * num_lines * height_multiplier)
    text_w = max_line_width

    x = (width - text_w) // 2
    y = y_pos - text_h

    final_x = max(0, x)
    final_y = max(0, y)
    final_w = min(width - final_x, text_w)
    final_h = min(height - final_y, text_h)

    return final_x, final_y, final_w, final_h


def calculate_blur_roi(text: str, width: int, height: int, settings: Dict[str, Any]) -> Tuple[int, int, int, int]:
    """Working ROI = green text ROI expanded by feather for soft outer blend."""
    if not text:
        return 0, 0, 0, 0

    font_size_px = int(settings.get("font_size", 21))
    tx, ty, tw, th = calculate_text_roi(text, width, height, settings)
    if tw <= 0 or th <= 0:
        return 0, 0, 0, 0

    feather = int(settings.get("feather", 30))
    pad_x = max(feather, int(font_size_px * 0.35))
    pad_y = max(feather, int(font_size_px * 0.25))

    left = tx - pad_x
    top = ty - pad_y
    right = tx + tw + pad_x
    bottom = ty + th + pad_y

    final_x = max(0, left)
    final_y = max(0, top)
    final_w = max(0, min(width, right) - final_x)
    final_h = max(0, min(height, bottom) - final_y)
    return final_x, final_y, final_w, final_h


def compute_feather_inner_roi(roi: Tuple[int, int, int, int], feather: int) -> Tuple[int, int, int, int]:
    """Inset rectangle for inward feather gradient."""
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0 or feather < 1:
        return roi
    inset = feather // 2
    return bx + inset, by + inset, max(1, bw - 2 * inset), max(1, bh - 2 * inset)


def core_relative_to_blur(
    text_roi: Tuple[int, int, int, int], blur_roi: Tuple[int, int, int, int]
) -> Tuple[int, int, int, int]:
    """Express green text ROI coordinates relative to the padded blur ROI."""
    tx, ty, tw, th = text_roi
    bx, by, bw, bh = blur_roi
    cx = max(0, tx - bx)
    cy = max(0, ty - by)
    cw = max(0, min(bw - cx, tw))
    ch = max(0, min(bh - cy, th))
    return cx, cy, cw, ch


def build_edge_fade_mask(bw: int, bh: int, feather: int) -> np.ndarray:
    """Float mask in [0,1] that is ~1 in the center and exactly 0 on the ROI perimeter."""
    if bw <= 0 or bh <= 0:
        return np.zeros((max(0, bh), max(0, bw)), dtype=np.float32)

    fade = max(1, min(feather if feather > 0 else 1, bw // 2, bh // 2, max(1, int(min(bw, bh) * 0.45))))
    ys = np.arange(bh, dtype=np.float32).reshape(-1, 1)
    xs = np.arange(bw, dtype=np.float32).reshape(1, -1)
    dist = np.minimum(np.minimum(xs, bw - 1 - xs), np.minimum(ys, bh - 1 - ys))
    return np.clip(dist / float(fade), 0.0, 1.0).astype(np.float32)


def build_soft_core_mask(
    bw: int,
    bh: int,
    core: Tuple[int, int, int, int],
    feather: int,
    alpha: float = 1.0,
) -> np.ndarray:
    """Soft rectangular mask: 1 inside green core, smooth falloff across outer pad, 0 at blur ROI edge.

    Does not rely on glyph/text detection — reliable on light backgrounds.
    """
    if bw <= 0 or bh <= 0:
        return np.zeros((max(0, bh), max(0, bw)), dtype=np.float32)

    cx, cy, cw, ch = core
    x1 = max(0, min(bw, cx))
    y1 = max(0, min(bh, cy))
    x2 = max(x1, min(bw, cx + max(0, cw)))
    y2 = max(y1, min(bh, cy + max(0, ch)))

    ys = np.arange(bh, dtype=np.float32).reshape(-1, 1)
    xs = np.arange(bw, dtype=np.float32).reshape(1, -1)

    # Signed distance outside the core rectangle (0 inside).
    dx = np.maximum(x1 - xs, np.maximum(0.0, xs - (x2 - 1)))
    dy = np.maximum(y1 - ys, np.maximum(0.0, ys - (y2 - 1)))
    dist_out = np.sqrt(dx * dx + dy * dy)

    fade = float(max(1, feather))
    mask = np.clip(1.0 - dist_out / fade, 0.0, 1.0)
    # Smoothstep for less visible seam than linear falloff.
    mask = mask * mask * (3.0 - 2.0 * mask)
    # Guarantee outer perimeter contribution is zero.
    mask *= build_edge_fade_mask(bw, bh, max(2, feather // 3))
    return np.clip(mask * alpha, 0.0, 1.0).astype(np.float32)
