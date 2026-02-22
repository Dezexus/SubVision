"""
This module defines the ImagePipeline class, which orchestrates a sequence
of image processing operations on a frame.
"""
from typing import Any, Optional
import concurrent.futures
import numpy as np
import cv2
from core.filters import (
    apply_scaling, apply_sharpening,
    denoise_frame, apply_scaling_paddle,
    apply_sharpening_paddle
)
from core.motion import detect_change_absolute, detect_change_paddle

try:
    import paddle
    HAS_PADDLE = True
except ImportError:
    HAS_PADDLE = False

class ImagePipeline:
    """
    Manages the chain of filters applied to video frames, optimizing for GPU resident data where possible.
    """
    def __init__(self, roi: list[int], config: dict[str, Any], thread_pool: Optional[concurrent.futures.ThreadPoolExecutor] = None) -> None:
        self.roi = roi
        self.config = config
        self.thread_pool = thread_pool
        self.last_raw_roi: Any = None
        self.skipped_count = 0

    def process(self, frame: Any) -> tuple[np.ndarray | None, bool]:
        """
        Processes a single frame through ROI extraction, motion detection, and image filtering.
        """
        is_tensor = HAS_PADDLE and isinstance(frame, paddle.Tensor)

        if self.roi and len(self.roi) == 4 and self.roi[2] > 0:
            x, y, w_roi, h_roi = self.roi
            if is_tensor:
                h, w, _ = frame.shape
            else:
                h, w = frame.shape[:2]

            y1, y2 = max(0, y), min(h, y + h_roi)
            x1, x2 = max(0, x), min(w, x + w_roi)

            frame_roi = frame[y1:y2, x1:x2]
        else:
            frame_roi = frame

        if is_tensor:
            if frame_roi.shape[0] == 0 or frame_roi.shape[1] == 0:
                return None, True
        elif frame_roi.size == 0:
            return None, True

        smart_skip = self.config.get("smart_skip", True)
        skipped = False

        if smart_skip and self.last_raw_roi is not None:
            if is_tensor:
                has_changed = detect_change_paddle(frame_roi, self.last_raw_roi)
            else:
                has_changed = detect_change_absolute(frame_roi, self.last_raw_roi)

            if not has_changed:
                self.skipped_count += 1
                skipped = True

        if not skipped:
            if is_tensor:
                self.last_raw_roi = frame_roi.clone()
            else:
                self.last_raw_roi = frame_roi.copy()

        if skipped:
            return None, True

        denoise_str = float(self.config.get("denoise_strength", 3))
        scale_factor = float(self.config.get("scale_factor", 2.0))

        if is_tensor:
            if denoise_str == 0:
                processed = apply_scaling_paddle(frame_roi, scale_factor)
                processed = apply_sharpening_paddle(processed)

                cpu_img_rgb = processed.numpy()
                final = cv2.cvtColor(cpu_img_rgb, cv2.COLOR_RGB2BGR)
                return final, False

            cpu_img_rgb = frame_roi.numpy()
            working_img = cv2.cvtColor(cpu_img_rgb, cv2.COLOR_RGB2BGR)

            denoised = denoise_frame(working_img, strength=denoise_str, thread_pool=self.thread_pool)
            processed = denoised

            if scale_factor > 1.0:
                try:
                    proc_rgb = cv2.cvtColor(processed, cv2.COLOR_BGR2RGB)
                    proc_tensor = paddle.to_tensor(proc_rgb)

                    scaled_tensor = apply_scaling_paddle(proc_tensor, scale_factor)
                    final_tensor = apply_sharpening_paddle(scaled_tensor)

                    final_rgb = final_tensor.numpy()
                    final = cv2.cvtColor(final_rgb, cv2.COLOR_RGB2BGR)
                    return final, False
                except Exception:
                    pass

            scaled = apply_scaling(processed, scale_factor=scale_factor)
            final = apply_sharpening(scaled)
            return final, False

        else:
            denoised = denoise_frame(frame_roi, strength=denoise_str, thread_pool=self.thread_pool)
            processed = denoised

            scaled = apply_scaling(processed, scale_factor=scale_factor)
            final = apply_sharpening(scaled)
            return final, False
