"""
Applies video blurring and obscuring effects.
"""
import os
import logging
import time
from typing import Optional, Tuple, List, Dict, Any, Callable
import cv2
import numpy as np

from core.geometry import calculate_blur_roi
from core.blur_effects import apply_blur_to_frame, generate_text_mask
from core.video_io import get_video_dar, get_video_metadata, iter_frames_ffmpeg

logger = logging.getLogger(__name__)


class BlurManager:
    @staticmethod
    def generate_preview(video_path: str, frame_index: int, settings: Dict[str, Any], text: str) -> Optional[np.ndarray]:
        from core.video_io import extract_frame_cv2
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
    ) -> Tuple[str, int]:
        base_name, ext = os.path.splitext(output_path)
        temp_video_path = f"{base_name}_temp{ext}"

        meta = get_video_metadata(video_path)
        width = meta["width"]
        height = meta["height"]
        fps = meta["fps"]
        total_frames = meta["total_frames"]

        font_size_px = int(blur_settings.get('font_size', 21))

        sample_frame = None
        for sub in subtitles:
            sub_id = sub.get('id', -1)
            start_f = max(0, int(sub['start'] * fps))
            end_f = min(total_frames - 1, int(sub['end'] * fps))
            mid_f = (start_f + end_f) // 2
            for f_idx, _, frame in iter_frames_ffmpeg(video_path, step=1, fps=fps, total=total_frames, width=width, height=height, use_hwaccel=False):
                if f_idx == mid_f:
                    sample_frame = frame
                    break
            if sample_frame is not None:
                break

        subtitle_masks: Dict[int, np.ndarray] = {}
        if blur_settings.get('mode', 'hybrid') == 'hybrid' and sample_frame is not None:
            for sub in subtitles:
                sub_id = sub.get('id', -1)
                text = sub.get('text', '').strip()
                if not text:
                    continue
                roi = calculate_blur_roi(text, width, height, blur_settings)
                mask = generate_text_mask(sample_frame, roi, font_size_px)
                subtitle_masks[sub_id] = mask

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

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(temp_video_path, fourcc, fps, (width, height))

        frame_idx = 0
        try:
            for f_idx, _, frame in iter_frames_ffmpeg(video_path, step=1, fps=fps, total=total_frames, width=width, height=height, use_hwaccel=True):
                if cancel_check():
                    raise InterruptedError("Stopped by user")

                if f_idx in frame_blur_map:
                    roi, sub_id = frame_blur_map[f_idx]
                    precalc_mask = subtitle_masks.get(sub_id)
                    frame = apply_blur_to_frame(frame, roi, blur_settings, precalculated_mask=precalc_mask)

                writer.write(frame)

                if frame_idx > 0 and frame_idx % 25 == 0:
                    progress_callback(frame_idx, total_frames)

                frame_idx += 1

            progress_callback(total_frames, total_frames)
        finally:
            writer.release()

        return temp_video_path, total_frames