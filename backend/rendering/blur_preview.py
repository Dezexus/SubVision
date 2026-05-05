from typing import Dict, Any
import cv2
import numpy as np
from rendering.geometry import calculate_blur_roi, calculate_text_roi
from rendering.effects.blur import apply_blur_to_frame
from rendering.effects.inpainting import generate_text_mask
from core.video_io import extract_frame_cv2

def generate_blur_preview(video_path: str, frame_index: int, settings: Dict[str, Any], text: str) -> np.ndarray | None:
    cached = extract_frame_cv2(video_path, frame_index)
    if cached is None:
        return None
    frame_bgr, _ = cached
    frame = frame_bgr.copy()
    height, width = frame.shape[:2]

    mode = settings.get('mode', 'hybrid')
    font_size_px = int(settings.get('font_size', 21))

    if mode == 'hybrid':
        text_roi = calculate_text_roi(text, width, height, settings)
        if text_roi[2] > 0 and text_roi[3] > 0:
            bx, by, bw, bh = text_roi
            pad = max(5, int(font_size_px * 0.2))
            y1 = max(0, by - pad)
            y2 = min(height, by + bh + pad)
            x1 = max(0, bx - pad)
            x2 = min(width, bx + bw + pad)

            mask = generate_text_mask(frame, (bx, by, bw, bh), font_size_px)
            roi_expanded = frame[y1:y2, x1:x2].copy()

            inpaint_radius = max(5, int(font_size_px * 0.3))
            inpainted = cv2.inpaint(roi_expanded, mask, inpaint_radius, cv2.INPAINT_NS)

            smooth_k = max(11, int(font_size_px * 0.8))
            if smooth_k % 2 == 0:
                smooth_k += 1
            inpainted_smooth = cv2.GaussianBlur(inpainted, (smooth_k, smooth_k), 0)

            blend_k = max(9, int(font_size_px * 0.6))
            if blend_k % 2 == 0:
                blend_k += 1

            soft_mask = cv2.GaussianBlur(mask, (blend_k, blend_k), 0).astype(np.float32) / 255.0
            soft_mask_3ch = cv2.merge([soft_mask, soft_mask, soft_mask])

            inpainted_float = inpainted_smooth.astype(np.float32)
            original_float = roi_expanded.astype(np.float32)

            blended = inpainted_float * soft_mask_3ch + original_float * (1.0 - soft_mask_3ch)
            frame[y1:y2, x1:x2] = blended.astype(np.uint8)

    blur_roi = calculate_blur_roi(text, width, height, settings)
    return apply_blur_to_frame(frame, blur_roi, settings)