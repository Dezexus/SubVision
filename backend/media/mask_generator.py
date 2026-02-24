"""
Module responsible for generating and caching optimal subtitle masks across multiple frames.
"""
import cv2
import numpy as np
from typing import List, Dict, Any

from core.geometry import calculate_blur_roi
from core.blur_effects import generate_text_mask
from core.video_io import create_video_capture

class MaskGenerator:
    """
    Generates and evaluates text masks to select the optimal bounding contours for rendering.
    """

    @staticmethod
    def generate_best_masks(
        video_path: str,
        subtitles: List[Dict[str, Any]],
        settings: Dict[str, Any],
        width: int,
        height: int,
        fps: float,
        total_frames: int
    ) -> Dict[int, np.ndarray]:
        """
        Samples multiple frames per subtitle to cache the mask with the largest text area.
        """
        subtitle_masks: Dict[int, np.ndarray] = {}
        if settings.get('mode', 'hybrid') != 'hybrid':
            return subtitle_masks

        font_size_px = int(settings.get('font_size', 21))
        cap = create_video_capture(video_path)

        if not cap.isOpened():
            return subtitle_masks

        try:
            for sub in subtitles:
                text = sub.get('text', '').strip()
                if not text:
                    continue

                roi = calculate_blur_roi(text, width, height, settings)
                sub_id = sub.get('id', -1)

                start_f = int(sub['start'] * fps)
                end_f = int(sub['end'] * fps)
                duration_frames = end_f - start_f

                sample_count = 5
                if duration_frames <= sample_count:
                    sample_indices = list(range(start_f, end_f))
                else:
                    step_f = duration_frames / sample_count
                    sample_indices = [int(start_f + i * step_f) for i in range(sample_count)]

                best_mask = None
                max_pixels = -1

                for f_idx in sample_indices:
                    f_idx = max(0, min(total_frames - 1, f_idx))
                    cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
                    ret, frm = cap.read()

                    if ret and frm is not None:
                        mask = generate_text_mask(frm, roi, font_size_px)
                        pixels = cv2.countNonZero(mask)
                        if pixels > max_pixels:
                            max_pixels = pixels
                            best_mask = mask

                if best_mask is not None:
                    subtitle_masks[sub_id] = best_mask
        finally:
            cap.release()

        return subtitle_masks
