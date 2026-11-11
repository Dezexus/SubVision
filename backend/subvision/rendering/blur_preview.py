from typing import Dict, Any, List, Optional, Tuple

import numpy as np

from subvision.core.video_io import extract_frame_cv2
from subvision.rendering.effects.blur import apply_blur_to_frame
from subvision.rendering.effects.inpainting import (
    _apply_hybrid_inpaint,
    _mask_coverage,
    generate_text_mask,
    tight_box_from_mask,
)
from subvision.rendering.geometry import calculate_text_roi, compute_feather_inner_roi


def generate_blur_preview(
    video_path: str,
    frame_index: int,
    settings: Dict[str, Any],
    text: str = "",
    subtitle_texts: Optional[List[str]] = None,
    cues: Optional[List[Tuple[str, Dict[str, Any]]]] = None,
) -> Optional[np.ndarray]:
    """Single-frame preview matching render behaviour for active cues.

    ``cues`` pairs each active text with its track's settings. Otherwise, when
    subtitle_texts is provided, each non-empty text is an active cue using
    ``settings``. Empty list / no real text → no effects (no dummy ROI).
    """
    cached = extract_frame_cv2(video_path, frame_index)
    if cached is None:
        return None
    frame_bgr, _ = cached
    frame = frame_bgr.copy()
    height, width = frame.shape[:2]

    if cues is not None:
        active = [(t.strip(), s) for t, s in cues if t and t.strip()]
    elif subtitle_texts is not None:
        active = [(t.strip(), settings) for t in subtitle_texts if t and t.strip()]
    elif text and text.strip() and text.strip() != "Preview Mode":
        active = [(text.strip(), settings)]
    else:
        active = []

    for cue_text, cue_settings in active:
        frame = _apply_cue(frame, cue_text, cue_settings, width, height)
    return frame


def _apply_cue(frame: np.ndarray, cue_text: str, settings: Dict[str, Any], width: int, height: int) -> np.ndarray:
    mode = settings.get("mode", "hybrid")
    font_size_px = int(settings.get("font_size", 21))
    pad = max(2, int(font_size_px * 0.2))

    text_roi = calculate_text_roi(cue_text, width, height, settings)
    if text_roi[2] <= 0 or text_roi[3] <= 0:
        return frame

    if mode == "hybrid":
        mask = generate_text_mask(frame, text_roi, font_size_px)
        if _mask_coverage(mask) > 0.0:
            work_roi, work_mask = tight_box_from_mask(mask, text_roi, pad, keep_height=True)
        else:
            work_roi = text_roi
            work_mask = np.zeros((text_roi[3], text_roi[2]), dtype=np.uint8)
        frame = _apply_hybrid_inpaint(
            frame,
            work_roi,
            font_size_px,
            mask=work_mask,
            apply_residual_blur=True,
            blur_settings=settings,
        )
    else:
        feather = int(settings.get("feather", 30))
        inner_roi = compute_feather_inner_roi(text_roi, feather)
        frame = apply_blur_to_frame(frame, text_roi, settings, 1.0, inner_roi)

    return frame
