from typing import Any
import numpy as np
from .image_ops import apply_clahe, apply_scaling, apply_sharpening, calculate_image_diff, denoise_frame

class ImagePipeline:
    """Manages image processing: ROI -> Denoise -> CLAHE -> Resize -> Sharpen."""

    def __init__(self, roi: list[int], config: dict[str, Any]) -> None:
        self.roi = roi
        self.config = config
        self.last_raw_roi: np.ndarray | None = None
        self.skipped_count = 0

    def process(self, frame: np.ndarray) -> tuple[np.ndarray | None, bool]:
        """Runs the pipeline, skipping frames if raw content is static."""
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

        if self.config.get("smart_skip", True) and self.last_raw_roi is not None:
            diff = calculate_image_diff(frame_roi, self.last_raw_roi)
            if diff < 0.005:
                self.skipped_count += 1
                return None, True

        self.last_raw_roi = frame_roi.copy()

        denoise_str = float(self.config.get("denoise_strength", 3))
        denoised = denoise_frame(frame_roi, strength=denoise_str)

        clahe_limit = float(self.config.get("clahe", 2.0))
        processed = apply_clahe(denoised, clip_limit=clahe_limit)

        scale_factor = float(self.config.get("scale_factor", 2.0))
        scaled = apply_scaling(processed, scale_factor=scale_factor)

        final = apply_sharpening(scaled)

        return final, False
