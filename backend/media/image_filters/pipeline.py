"""
Orchestrates image processing operations on a frame dynamically.
"""
from typing import Any
import numpy as np
import cv2
from core.filters import apply_scaling, apply_sharpening, denoise_frame
from core.motion import detect_change_absolute
from core.gpu_utils import has_cuda, ensure_gpu


class ImagePipeline:
    """Manages the chain of filters applied to video frames sequentially."""

    def __init__(self, roi: list[int], config: dict[str, Any]) -> None:
        self.roi = roi
        self.config = config
        self.last_raw_roi: Any = None
        self.last_raw_roi_gpu: Any = None
        self.skipped_count = 0

    def process(self, frame: np.ndarray) -> tuple[np.ndarray | None, bool]:
        if self.roi and len(self.roi) == 4 and self.roi[2] > 0:
            x, y, w_roi, h_roi = self.roi
            h, w = frame.shape[:2]
            y1, y2 = max(0, y), min(h, y + h_roi)
            x1, x2 = max(0, x), min(w, x + w_roi)
            frame_roi = frame[y1:y2, x1:x2]
        else:
            frame_roi = frame

        if frame_roi.size == 0:
            return None, True

        smart_skip = self.config.get("smart_skip", True)
        skipped = False

        if smart_skip and self.last_raw_roi is not None:
            compare_target = self.last_raw_roi_gpu if self.last_raw_roi_gpu is not None else self.last_raw_roi
            has_changed = detect_change_absolute(frame_roi, compare_target)
            if not has_changed:
                self.skipped_count += 1
                skipped = True

        if not skipped:
            self.last_raw_roi = frame_roi.copy()
            if has_cuda():
                self.last_raw_roi_gpu = ensure_gpu(self.last_raw_roi)
            else:
                self.last_raw_roi_gpu = None

        if skipped:
            return None, True

        denoise_str = float(self.config.get("denoise_strength", 3))
        scale_factor = float(self.config.get("scale_factor", 2.0))

        denoised = denoise_frame(frame_roi, strength=denoise_str)
        processed = denoised
        scaled = apply_scaling(processed, scale_factor=scale_factor)
        final = apply_sharpening(scaled)
        return final, False