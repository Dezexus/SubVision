"""
Module providing video reading, conversion, and preview generation mechanisms.
"""
import logging
import os
import subprocess
from typing import Any

import cv2
import numpy as np
from PIL import Image

from core.image_ops import (
    apply_sharpening,
    calculate_roi_from_mask,
    denoise_frame,
    extract_frame_cv2,
)

logger = logging.getLogger(__name__)

class VideoManager:
    """
    A collection of static methods for video conversion, metadata extraction, and previews.
    """

    @staticmethod
    def convert_video_to_h264(input_path: str) -> str | None:
        """
        Converts a video to a standard MP4 format using FFmpeg with robust audio encoding.
        """
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
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            logger.info("Conversion successful.")
            return output_path
        except (subprocess.CalledProcessError, FileNotFoundError):
            logger.error("FFmpeg conversion failed.")
            if os.path.exists(output_path):
                os.remove(output_path)
            return None

    @staticmethod
    def get_video_info(video_path: str | None) -> tuple[np.ndarray | None, int]:
        """
        Extracts the total frame count and the first valid frame from a video with fallback.
        """
        if not video_path:
            return None, 1

        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_ANY])
        ok, frame = cap.read()

        if not ok:
            cap.release()
            cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])
            ok, frame = cap.read()

        try:
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            attempts = 0

            while not ok and attempts < 15:
                ok, frame = cap.read()
                attempts += 1

            if not ok and total > 10:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 10)
                for _ in range(5):
                    ok, frame = cap.read()
                    if ok:
                        break

            return (cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), total) if ok else (None, 1)
        finally:
            cap.release()

    @staticmethod
    def get_frame_image(video_path: str, frame_index: int) -> np.ndarray | None:
        """
        Retrieves a specific frame from a video by its index.
        """
        frame = extract_frame_cv2(video_path, frame_index)
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if frame is not None else None

    @staticmethod
    def generate_preview(
            video_path: str,
            frame_index: int,
            editor_data: dict[str, Any] | None,
            scale_factor: float,
    ) -> Image.Image | None:
        """
        Generates a processed preview image for a specific frame based on UI parameters.
        """
        if not video_path:
            return None

        frame_bgr = extract_frame_cv2(video_path, frame_index)
        if frame_bgr is None:
            return None

        roi = editor_data.get("roi_override") or calculate_roi_from_mask(editor_data)

        if len(roi) == 4 and roi[2] > 0 and roi[3] > 0:
            h_img, w_img = frame_bgr.shape[:2]
            x, y, w, h = roi
            frame_roi = frame_bgr[y : y + h, x : x + w]
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
