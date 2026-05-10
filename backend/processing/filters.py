from typing import Any
import numpy as np
import cv2
from core.filters import apply_scaling, apply_sharpening, denoise_frame
from core.motion import detect_change_absolute

class ImagePipeline:
    """Pipeline for processing video frames and extracting ROIs."""
    
    def __init__(self, roi: list[int], config: dict[str, Any]) -> None:
        self.roi = roi
        self.config = config
        self.last_raw_roi: Any = None
        self.skipped_count = 0
        self.max_continuous_skips = 10

    def get_roi(self, frame: np.ndarray) -> np.ndarray:
        """Extract Region of Interest from the given frame."""
        if self.roi and len(self.roi) == 4 and self.roi[2] > 0:
            x, y, w_roi, h_roi = self.roi
            h, w = frame.shape[:2]
            y1, y2 = max(0, y), min(h, y + h_roi)
            x1, x2 = max(0, x), min(w, x + w_roi)
            return frame[y1:y2, x1:x2]
        return frame

    def process(self, frame: np.ndarray) -> tuple[np.ndarray | None, bool]:
        """Process the frame and determine if it should be skipped."""
        frame_roi = self.get_roi(frame)

        if frame_roi.size == 0:
            return None, True

        skipped = False

        if self.last_raw_roi is not None:
            has_changed = detect_change_absolute(frame_roi, self.last_raw_roi)
            if not has_changed and self.skipped_count < self.max_continuous_skips:
                self.skipped_count += 1
                skipped = True
            else:
                self.skipped_count = 0

        if not skipped:
            self.last_raw_roi = frame_roi.copy()

        if skipped:
            return None, True

        return self.apply_filters(frame), False

    def apply_filters(self, frame: np.ndarray) -> np.ndarray | None:
        """Apply configured filters to the extracted ROI."""
        frame_roi = self.get_roi(frame)
        if frame_roi.size == 0:
            return None

        denoise_str = float(self.config.get("denoise_strength", 3))
        scale_factor = float(self.config.get("scale_factor", 2.0))

        denoised = denoise_frame(frame_roi, strength=denoise_str)
        scaled = apply_scaling(denoised, scale_factor=scale_factor)
        return apply_sharpening(scaled)