"""
Applies video blurring and obscuring effects.
"""
import logging
from typing import Optional, Tuple, List, Dict, Any, Callable
import cv2
import numpy as np

from core.geometry import calculate_blur_roi
from core.blur_effects import apply_blur_to_frame, generate_text_mask
from core.video_io import get_video_dar, get_video_metadata, iter_frames_ffmpeg
from media.transcoder import FFmpegTranscoder

logger = logging.getLogger(__name__)


def _extract_raw_frame(video_path: str, frame_index: int, total_frames: int, fps: float) -> Optional[np.ndarray]:
    """Extract a single raw frame from video without SAR correction."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return None
    try:
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
        success, frame = cap.read()
        if not success and fps > 0:
            cap.set(cv2.CAP_PROP_POS_MSEC, (frame_index / fps) * 1000.0)
            success, frame = cap.read()
        if success:
            return frame
    finally:
        cap.release()
    return None


def _roi_contrast_score(frame: np.ndarray, roi: Tuple[int, int, int, int]) -> float:
    """Compute a simple contrast score for a region of interest based on luminance variance."""
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0:
        return 0.0
    roi_area = frame[by:by+bh, bx:bx+bw]
    gray = cv2.cvtColor(roi_area, cv2.COLOR_BGR2GRAY)
    return float(np.var(gray))


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
            cancel_check: Callable[[], bool],
            dar: Optional[float] = None,
    ) -> int:
        """Apply blur to subtitles and directly encode final video with audio."""
        meta = get_video_metadata(video_path)
        width = meta["width"]
        height = meta["height"]
        fps = meta["fps"]
        total_frames = meta["total_frames"]

        font_size_px = int(blur_settings.get('font_size', 21))

        subtitle_masks: Dict[int, np.ndarray] = {}
        mask_cache: Dict[Tuple, Optional[np.ndarray]] = {}

        if blur_settings.get('mode', 'hybrid') == 'hybrid':
            for sub in subtitles:
                sub_id = sub.get('id', -1)
                text = sub.get('text', '').strip()
                if not text:
                    continue
                roi = calculate_blur_roi(text, width, height, blur_settings)
                cache_key = (text, roi[0], roi[1], roi[2], roi[3], font_size_px)

                if cache_key in mask_cache:
                    mask = mask_cache[cache_key]
                else:
                    start_f = max(0, int(sub['start'] * fps))
                    end_f = min(total_frames - 1, int(sub['end'] * fps))
                    mid_f = (start_f + end_f) // 2
                    frame_indices = [start_f, mid_f, end_f]

                    best_frame = None
                    best_score = -1.0
                    for idx in sorted(set(frame_indices)):
                        frame = _extract_raw_frame(video_path, idx, total_frames, fps)
                        if frame is not None:
                            score = _roi_contrast_score(frame, roi)
                            if score > best_score:
                                best_score = score
                                best_frame = frame

                    if best_frame is not None:
                        mask = generate_text_mask(best_frame, roi, font_size_px)
                    else:
                        mask = None
                    mask_cache[cache_key] = mask

                if mask is not None:
                    subtitle_masks[sub_id] = mask

        frame_blur_map: Dict[int, List[Tuple[Tuple[int, int, int, int], int]]] = {}
        for sub in subtitles:
            text = sub.get('text', '').strip()
            if not text:
                continue
            roi = calculate_blur_roi(text, width, height, blur_settings)
            start_f = max(0, int(sub['start'] * fps) - 1)
            end_f = min(total_frames + 5, int(sub['end'] * fps) + 1)
            sub_id = sub.get('id', -1)
            for f_idx in range(start_f, end_f):
                if f_idx not in frame_blur_map:
                    frame_blur_map[f_idx] = []
                frame_blur_map[f_idx].append((roi, sub_id))

        proc, stdin_pipe = FFmpegTranscoder.encode_with_audio_pipe(
            original_video_path=video_path,
            output_path=output_path,
            fps=fps,
            width=width,
            height=height,
            dar=dar,
        )

        frame_idx = 0
        try:
            for f_idx, _, frame in iter_frames_ffmpeg(
                video_path, step=1, fps=fps, total=total_frames,
                width=width, height=height, use_hwaccel=True,
            ):
                if cancel_check():
                    raise InterruptedError("Stopped by user")

                if f_idx in frame_blur_map:
                    for roi, sub_id in frame_blur_map[f_idx]:
                        precalc_mask = subtitle_masks.get(sub_id)
                        frame = apply_blur_to_frame(frame, roi, blur_settings, precalculated_mask=precalc_mask)

                stdin_pipe.write(frame.tobytes())

                if frame_idx > 0 and frame_idx % 25 == 0:
                    progress_callback(frame_idx, total_frames)

                frame_idx += 1

            progress_callback(total_frames, total_frames)
        finally:
            stdin_pipe.close()
            proc.wait()
            if proc.returncode != 0:
                stderr_output = proc.stderr.read().decode(errors='replace')
                logger.error("FFmpeg encoding failed: %s", stderr_output)
                raise RuntimeError(f"FFmpeg exited with code {proc.returncode}")

        return total_frames