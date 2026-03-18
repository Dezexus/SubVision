"""
Manager responsible for applying video blurring and obscuring effects.
"""
import cv2
import os
import logging
import numpy as np
from typing import Optional, Tuple, List, Dict, Any, Callable

from core.geometry import calculate_blur_roi
from core.blur_effects import apply_blur_to_frame
from core.video_io import extract_frame_cv2, create_video_capture
from core.constants import DEFAULT_FPS
from media.mask_generator import MaskGenerator

logger = logging.getLogger(__name__)


class BlurManager:
    """
    Provides stateless video blurring functionality using a sequential processing pipeline.
    """

    @staticmethod
    def generate_preview(video_path: str, frame_index: int, settings: Dict[str, Any], text: str) -> Optional[np.ndarray]:
        """
        Generates a single preview frame with the obscuring filter applied.
        """
        cached = extract_frame_cv2(video_path, frame_index)
        if cached is None:
            return None
        frame_bgr, _ = cached
        frame = frame_bgr.copy()
        height, width = frame.shape[:2]
        roi = calculate_blur_roi(text, width, height, settings)
        return apply_blur_to_frame(frame, roi, settings)

    @staticmethod
    def apply_blur_task_sync(
            video_path: str,
            subtitles: List[Dict[str, Any]],
            blur_settings: Dict[str, Any],
            output_path: str,
            progress_callback: Callable[[int, int], None],
            cancel_check: Callable[[], bool]
    ) -> str:
        base_name, ext = os.path.splitext(output_path)
        temp_video_path = f"{base_name}_temp{ext}"

        cap = create_video_capture(video_path)
        if not cap.isOpened():
            raise ValueError("Could not open video file")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or DEFAULT_FPS
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(temp_video_path, fourcc, fps, (width, height))

        subtitle_masks = MaskGenerator.generate_best_masks(
            video_path, subtitles, blur_settings, width, height, fps, total_frames
        )

        frame_blur_map: Dict[int, Tuple[Tuple[int, int, int, int], int]] = {}
        for sub in subtitles:
            text = sub.get('text', '').strip()
            if not text:
                continue
            roi = calculate_blur_roi(text, width, height, blur_settings)
            start_f = max(0, int(sub['start'] * fps) - 1)
            end_f = min(total_frames + 5, int(sub['end'] * fps) + 1)
            for f_idx in range(start_f, end_f):
                frame_blur_map[f_idx] = (roi, sub.get('id', -1))

        try:
            frame_idx = 0
            while cap.isOpened():
                if cancel_check():
                    raise InterruptedError("Stopped by user")

                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx in frame_blur_map:
                    roi, sub_id = frame_blur_map[frame_idx]
                    precalc_mask = subtitle_masks.get(sub_id)
                    frame = apply_blur_to_frame(frame, roi, blur_settings, precalculated_mask=precalc_mask)

                writer.write(frame)

                if frame_idx > 0 and frame_idx % 25 == 0:
                    progress_callback(frame_idx, total_frames)

                frame_idx += 1

            progress_callback(total_frames, total_frames)
        finally:
            cap.release()
            writer.release()

        return temp_video_path