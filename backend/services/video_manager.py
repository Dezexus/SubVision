import logging
import os
import subprocess
from typing import Any

import cv2
import numpy as np
from PIL import Image

from core.image_ops import (
    apply_clahe,
    apply_sharpening,
    calculate_roi_from_mask,
    denoise_frame,
    extract_frame_cv2,
)

logger = logging.getLogger(__name__)


class VideoManager:
    """Utilities for video conversion, metadata extraction, and preview generation."""

    @staticmethod
    def convert_video_to_h264(input_path: str) -> str | None:
        """Converts video to standard MP4 (H.264) using FFmpeg."""
        if not input_path:
            return None

        output_path = f"{input_path}_converted.mp4"
        if os.path.exists(output_path):
            return output_path

        logger.info(f"Converting {input_path} to compatible format...")

        cmd = [
            "ffmpeg", "-y", "-i", input_path, "-c:v", "libx264",
            "-preset", "ultrafast", "-crf", "23", "-c:a", "copy",
            output_path,
        ]
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return output_path
        except subprocess.CalledProcessError:
            logger.error("FFmpeg conversion failed.")
            return None

    @staticmethod
    def get_video_info(video_path: str | None) -> tuple[np.ndarray | None, int]:
        """Returns the first frame and total frame count."""
        os.environ["DISABLE_MODEL_SOURCE_CHECK"] = "1"
        os.environ["OPENCV_LOG_LEVEL"] = "OFF"

        if video_path is None:
            return None, 1

        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])

        if not cap.isOpened():
            return None, 1

        try:
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            ok, frame = cap.read()

            if not ok and total > 10:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 10)
                ok, frame = cap.read()

            if not ok or frame is None:
                return None, 1

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            return frame_rgb, total

        except cv2.error:
            return None, 1
        finally:
            cap.release()

    @staticmethod
    def get_frame_image(video_path: str, frame_index: int) -> np.ndarray | None:
        """Returns the frame at the specified index in RGB format."""
        frame = extract_frame_cv2(video_path, frame_index)
        if frame is None:
            return None
        return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    @staticmethod
    def generate_preview(
        video_path: str,
        frame_index: int,
        editor_data: dict[str, Any] | None,
        clahe_val: float,
        scale_factor: float,
    ) -> Image.Image | None:
        """Generates a processed preview image with filters applied."""
        if video_path is None:
            return None

        frame_bgr = extract_frame_cv2(video_path, frame_index)
        if frame_bgr is None:
            return None

        if editor_data and "roi_override" in editor_data:
            roi = editor_data["roi_override"]
        else:
            roi = calculate_roi_from_mask(editor_data)

        if len(roi) == 4 and roi[2] > 0:
            h_img, w_img = frame_bgr.shape[:2]
            x = min(max(0, roi[0]), w_img)
            y = min(max(0, roi[1]), h_img)
            w = min(roi[2], w_img - x)
            h = min(roi[3], h_img - y)
            frame_roi = frame_bgr[y : y + h, x : x + w]
        else:
            frame_roi = frame_bgr

        denoised = denoise_frame(frame_roi, strength=3.0)
        processed = apply_clahe(denoised, clip_limit=clahe_val)

        if scale_factor > 1.0:
            processed_resized = cv2.resize(
                processed, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC
            )
        else:
            processed_resized = processed

        final = apply_sharpening(processed_resized)

        if final is None:
            return None

        return Image.fromarray(cv2.cvtColor(final, cv2.COLOR_BGR2RGB))
