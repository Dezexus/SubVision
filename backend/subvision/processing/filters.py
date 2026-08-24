from typing import Any
import numpy as np
from subvision.core.filters import apply_scaling, denoise_frame
from subvision.core.motion import detect_change_absolute


class ImagePipeline:
    """Pipeline for processing ROI crops from subtitle regions."""

    def __init__(self, roi: list[int], config: dict[str, Any]) -> None:
        self.roi = roi
        self.config = config
        self.last_raw_roi: np.ndarray | None = None
        self.skipped_count = 0
        self.max_continuous_skips = 10
        self.smart_skip = bool(config.get("smart_skip", True))
        self.motion_mse_thresh = float(config.get("motion_mse_thresh", 15.0))

    def crop_roi(self, frame: np.ndarray) -> np.ndarray | None:
        """Extract ROI crop from a full frame."""
        if self.roi and len(self.roi) == 4 and self.roi[2] > 0:
            x, y, w_roi, h_roi = self.roi
            h, w = frame.shape[:2]
            y1, y2 = max(0, y), min(h, y + h_roi)
            x1, x2 = max(0, x), min(w, x + w_roi)
            crop = frame[y1:y2, x1:x2]
            return crop if crop.size > 0 else None
        return frame if frame.size > 0 else None

    def check_motion(self, roi_crop: np.ndarray) -> bool:
        """Return True if OCR may be skipped (ROI unchanged). Updates motion baseline."""
        if not self.smart_skip:
            self.last_raw_roi = roi_crop.copy()
            return False

        if self.last_raw_roi is not None:
            has_changed = detect_change_absolute(
                roi_crop,
                self.last_raw_roi,
                mse_thresh=self.motion_mse_thresh,
            )
            if not has_changed and self.skipped_count < self.max_continuous_skips:
                self.skipped_count += 1
                return True
            self.skipped_count = 0

        self.last_raw_roi = roi_crop.copy()
        return False

    def apply_filters_to_roi(self, roi_crop: np.ndarray) -> np.ndarray | None:
        """Apply denoise and scale to an already cropped ROI."""
        if roi_crop is None or roi_crop.size == 0:
            return None

        denoise_str = float(self.config.get("denoise_strength", 3))
        scale_factor = float(self.config.get("scale_factor", 2.0))

        denoised = denoise_frame(roi_crop, strength=denoise_str)
        return apply_scaling(denoised, scale_factor=scale_factor)
