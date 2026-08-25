from typing import Dict, Any, Optional
import numpy as np
from subvision.rendering.geometry import calculate_text_roi, calculate_blur_roi
from subvision.rendering.effects.blur import apply_blur_to_frame
from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint
from subvision.rendering.effects.lama import apply_lama_inpaint
from subvision.core.video_io import extract_frame_cv2


def generate_blur_preview(video_path: str, frame_index: int, settings: Dict[str, Any], text: str) -> Optional[np.ndarray]:
    """Preview with soft-pad + pyramid blend (same path as render)."""
    cached = extract_frame_cv2(video_path, frame_index)
    if cached is None:
        return None
    frame_bgr, _ = cached
    frame = frame_bgr.copy()
    height, width = frame.shape[:2]

    mode = settings.get("mode", "hybrid")
    text_roi = calculate_text_roi(text, width, height, settings)
    blur_roi = calculate_blur_roi(text, width, height, settings)

    if text_roi[2] <= 0 or text_roi[3] <= 0 or blur_roi[2] <= 0 or blur_roi[3] <= 0:
        return frame

    if mode == "hybrid":
        frame = _apply_hybrid_inpaint(frame, text_roi, settings, blur_roi)
    elif mode == "lama":
        frame = apply_lama_inpaint(frame, text_roi, settings, blur_roi)

    return apply_blur_to_frame(frame, blur_roi, settings, 1.0, text_roi=text_roi)
