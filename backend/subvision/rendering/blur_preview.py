from typing import Dict, Any, Optional

import numpy as np

from subvision.core.video_io import extract_frame_cv2
from subvision.rendering.effects.blur import apply_blur_to_frame
from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint
from subvision.rendering.geometry import calculate_text_roi, compute_feather_inner_roi


def generate_blur_preview(video_path: str, frame_index: int, settings: Dict[str, Any], text: str) -> Optional[np.ndarray]:
    """Generates a single frame with effects applied within the green text ROI."""
    cached = extract_frame_cv2(video_path, frame_index)
    if cached is None:
        return None
    frame_bgr, _ = cached
    frame = frame_bgr.copy()
    height, width = frame.shape[:2]

    mode = settings.get("mode", "hybrid")
    font_size_px = int(settings.get("font_size", 21))
    text_roi = calculate_text_roi(text, width, height, settings)

    if mode == "hybrid" and text_roi[2] > 0 and text_roi[3] > 0:
        frame = _apply_hybrid_inpaint(frame, text_roi, font_size_px)
    elif mode == "propainter" and text_roi[2] > 0 and text_roi[3] > 0:
        from subvision.rendering.effects.propainter import apply_propainter_preview

        frame = apply_propainter_preview(
            frame, frame_index, text_roi, font_size_px, video_path, settings
        )

    if text_roi[2] <= 0 or text_roi[3] <= 0:
        return frame

    feather = int(settings.get("feather", 30))
    inner_roi = compute_feather_inner_roi(text_roi, feather)
    return apply_blur_to_frame(frame, text_roi, settings, 1.0, inner_roi)
