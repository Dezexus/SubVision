"""
This module defines the ImagePipeline class, which orchestrates a sequence
of image processing operations on a frame.
"""
from typing import Any
import numpy as np
from .image_ops import apply_clahe, apply_scaling, apply_sharpening, calculate_image_diff, denoise_frame

class ImagePipeline:
    """
    Manages a sequential image processing workflow:
    ROI Cropping -> Denoising -> CLAHE -> Scaling -> Sharpening.
    It also includes logic to skip processing for static frames to save resources.
    """

    def __init__(self, roi: list[int], config: dict[str, Any]) -> None:
        """
        Initializes the pipeline with a Region of Interest (ROI) and configuration.

        Args:
            roi: A list [x, y, width, height] defining the processing area.
            config: A dictionary with processing parameters.
        """
        self.roi = roi
        self.config = config
        self.last_raw_roi: np.ndarray | None = None
        self.skipped_count = 0

    def process(self, frame: np.ndarray) -> tuple[np.ndarray | None, bool]:
        """
        Applies the full processing pipeline to an input frame.

        It first crops the frame to the defined ROI. It can optionally skip
        processing if the content of the ROI has not changed significantly
        since the last processed frame.

        Args:
            frame: The raw input image frame as a NumPy array.

        Returns:
            A tuple containing the processed image (or None if skipped/failed)
            and a boolean indicating if the frame was skipped.
        """
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
