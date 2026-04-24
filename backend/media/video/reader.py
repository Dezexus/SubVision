"""Module providing video reading mechanisms via ffmpeg pipe."""
from collections.abc import Iterator
from typing import Any
import cv2
import logging

from core.video_io import create_video_capture, iter_frames_ffmpeg
from core.constants import DEFAULT_FPS

logger = logging.getLogger(__name__)


class VideoProvider:
    """Stable video frame extraction using ffmpeg pipe with optional HW acceleration."""

    def __init__(self, video_path: str, step: int = 1, use_hwaccel: bool = True) -> None:
        self.video_path = video_path
        self.step = step
        self.use_hwaccel = use_hwaccel

        cap = create_video_capture(video_path)
        if not cap.isOpened():
            raise FileNotFoundError(f"OpenCV could not read or open the video file: {video_path}")

        self.total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = cap.get(cv2.CAP_PROP_FPS) or DEFAULT_FPS
        self.width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self.height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()

        if self.total_frames <= 0 or self.width <= 0 or self.height <= 0:
            raise RuntimeError("Failed to retrieve valid video metadata")

    def __iter__(self) -> Iterator[tuple[int, float, Any]]:
        logger.info("Starting ffmpeg pipe for %s, total frames %d", self.video_path, self.total_frames)
        yield from iter_frames_ffmpeg(
            video_path=self.video_path,
            step=self.step,
            fps=self.fps,
            total=self.total_frames,
            width=self.width,
            height=self.height,
            use_hwaccel=self.use_hwaccel
        )

    def release(self) -> None:
        pass