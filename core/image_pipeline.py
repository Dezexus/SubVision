from typing import Any

import numpy as np

from .image_ops import (
    apply_clahe,
    apply_scaling,
    apply_sharpening,
    calculate_image_diff,
    denoise_frame,
)


class ImagePipeline:
    """Manages the image processing chain (ROI, Denoise, CLAHE, Resize, Sharpen)."""

    def __init__(self, roi: list[int], config: dict[str, Any]) -> None:
        self.roi = roi
        self.config = config
        self.last_processed_img: np.ndarray | None = None
        self.skipped_count = 0

    def process(self, frame: np.ndarray) -> tuple[np.ndarray | None, bool]:
        """Processes a frame and returns the final image for OCR."""
        h, w = frame.shape[:2]
        if self.roi and len(self.roi) == 4 and self.roi[2] > 0:
            x, y, w_roi, h_roi = self.roi
            y1, y2 = max(0, y), min(h, y + h_roi)
            x1, x2 = max(0, x), min(w, x + w_roi)
            frame_roi = frame[y1:y2, x1:x2]
        else:
            frame_roi = frame

        if frame_roi.size == 0:
            return None, True

        denoise_str = float(self.config.get("denoise_strength", 3))
        denoised = denoise_frame(frame_roi, strength=denoise_str)

        if self.config.get("smart_skip", True) and self.last_processed_img is not None:
            diff = calculate_image_diff(denoised, self.last_processed_img)
            if diff < 0.005:
                self.skipped_count += 1
                return None, True

        clahe_limit = float(self.config.get("clahe", 2.0))
        processed = apply_clahe(denoised, clip_limit=clahe_limit)

        scale_factor = float(self.config.get("scale_factor", 2.0))
        scaled = apply_scaling(processed, scale_factor=scale_factor)

        final = apply_sharpening(scaled)

        if denoised is not None:
            self.last_processed_img = denoised.copy()

        return final, False
