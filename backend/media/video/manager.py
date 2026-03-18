"""
Module for handling standard video metadata parsing and conversions asynchronously.
"""
import logging
import os
import asyncio
from typing import Any, Tuple

import cv2
import numpy as np
from PIL import Image

from core.filters import apply_sharpening, denoise_frame
from core.video_io import extract_frame_cv2, create_video_capture, get_video_dar

logger = logging.getLogger(__name__)

class VideoManager:
    """
    A collection of static methods for video conversion, metadata extraction, and previews.
    """

    @staticmethod
    async def convert_video_to_h264(input_path: str) -> str | None:
        if not input_path:
            return None

        output_path = f"{os.path.splitext(input_path)[0]}_converted.mp4"
        if os.path.exists(output_path):
            return output_path

        logger.info(f"Attempting to convert {input_path} to a compatible format...")
        cmd = [
            "ffmpeg", "-y", "-i", input_path, "-c:v", "libx264",
            "-preset", "ultrafast", "-crf", "26", "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL
            )
            await process.wait()

            if process.returncode == 0:
                logger.info("Conversion successful.")
                return output_path

            logger.error("FFmpeg conversion failed.")
            if os.path.exists(output_path):
                os.remove(output_path)
            return None
        except Exception:
            logger.error("FFmpeg conversion failed.")
            if os.path.exists(output_path):
                os.remove(output_path)
            return None

    @staticmethod
    def get_video_info(video_path: str | None) -> Tuple[np.ndarray | None, int, int]:
        if not video_path:
            return None, 1, 0

        dar = get_video_dar(video_path)

        result = extract_frame_cv2(video_path, 0, dar=dar)
        if result is None:
            return None, 1, 0

        frame, corrected_width = result

        cap = create_video_capture(video_path)
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        return (cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), total, corrected_width)

    @staticmethod
    def get_frame_image(video_path: str, frame_index: int) -> np.ndarray | None:
        dar = get_video_dar(video_path)
        result = extract_frame_cv2(video_path, frame_index, dar=dar)
        if result is None:
            return None
        frame, _ = result
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    @staticmethod
    def generate_preview(
            video_path: str,
            frame_index: int,
            editor_data: dict[str, Any] | None,
            scale_factor: float,
    ) -> Image.Image | None:
        if not video_path:
            return None

        dar = get_video_dar(video_path)
        result = extract_frame_cv2(video_path, frame_index, dar=dar)
        if result is None:
            return None

        frame_bgr, corrected_width = result
        original_height, original_width_orig = frame_bgr.shape[:2]

        roi = editor_data.get("roi_override", [0, 0, 0, 0]) if editor_data else [0, 0, 0, 0]
        if len(roi) == 4 and roi[2] > 0 and roi[3] > 0:
            x, y, w, h = roi
            scale_x = corrected_width / original_width_orig
            x_corr = int(round(x * scale_x))
            w_corr = int(round(w * scale_x))
            y_corr = y
            h_corr = h

            x_corr = max(0, min(x_corr, corrected_width - 1))
            y_corr = max(0, min(y_corr, original_height - 1))
            w_corr = min(w_corr, corrected_width - x_corr)
            h_corr = min(h_corr, original_height - y_corr)

            if w_corr > 0 and h_corr > 0:
                frame_roi = frame_bgr[y_corr:y_corr + h_corr, x_corr:x_corr + w_corr]
            else:
                frame_roi = frame_bgr
        else:
            frame_roi = frame_bgr

        if frame_roi.size == 0:
            return None

        denoised = denoise_frame(frame_roi, strength=3.0)
        processed = denoised

        if scale_factor > 1.0 and processed is not None:
            processed_resized = cv2.resize(processed, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)
        else:
            processed_resized = processed

        final = apply_sharpening(processed_resized)
        if final is None:
            return None

        return Image.fromarray(cv2.cvtColor(final, cv2.COLOR_BGR2RGB))