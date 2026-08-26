from typing import Dict, Any, List, Optional

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
) -> Optional[np.ndarray]:
    """Single-frame preview matching render behaviour for active cues.

    When subtitle_texts is provided, each non-empty text is treated as an active
    cue (same as render). Empty list / no real text → no effects (no dummy ROI).
    """
    cached = extract_frame_cv2(video_path, frame_index)
    if cached is None:
        return None
    frame_bgr, _ = cached
    frame = frame_bgr.copy()
    height, width = frame.shape[:2]

    mode = settings.get("mode", "hybrid")
    font_size_px = int(settings.get("font_size", 21))

    texts: List[str] = []
    if subtitle_texts is not None:
        texts = [t.strip() for t in subtitle_texts if t and t.strip()]
    elif text and text.strip() and text.strip() != "Preview Mode":
        texts = [text.strip()]

    if not texts:
        return frame

    pad = max(2, int(font_size_px * 0.2))

    for cue_text in texts:
        text_roi = calculate_text_roi(cue_text, width, height, settings)
        if text_roi[2] <= 0 or text_roi[3] <= 0:
            continue

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
        elif mode == "propainter":
            from subvision.rendering.effects.propainter import apply_propainter_preview

            frame = apply_propainter_preview(
                frame, frame_index, text_roi, font_size_px, video_path, settings
            )
        else:
            feather = int(settings.get("feather", 30))
            inner_roi = compute_feather_inner_roi(text_roi, feather)
            frame = apply_blur_to_frame(frame, text_roi, settings, 1.0, inner_roi)

    return frame
