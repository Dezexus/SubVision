"""
Module providing video reading mechanisms.
"""
from collections.abc import Iterator
from typing import Any
import cv2
import logging

from core.video_io import create_video_capture
from core.constants import DEFAULT_FPS

logger = logging.getLogger(__name__)


class VideoProvider:
    """
    Handles stable video file reading and frame extraction with software fallback.
    """

    def __init__(self, video_path: str, step: int = 1) -> None:
        self.step = step
        self.cap = create_video_capture(video_path)

        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or DEFAULT_FPS

    def __iter__(self) -> Iterator[tuple[int, float, Any]]:
        """
        Yields frame index, timestamp, and contiguous frame data.
        """
        frame_idx = 0
        while self.cap.isOpened():
            ok, frame = self.cap.read()
            if not ok:
                break

            if frame_idx % self.step == 0:
                msec = self.cap.get(cv2.CAP_PROP_POS_MSEC)
                timestamp = msec / 1000.0 if msec > 0 else frame_idx / self.fps
                yield frame_idx, timestamp, frame

            frame_idx += 1

    def release(self) -> None:
        """
        Releases the underlying video decoding resources safely.
        """
        if self.cap:
            self.cap.release()
