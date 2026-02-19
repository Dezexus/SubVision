"""
Video provider utility for iterating through frames utilizing safe OpenCV hardware decoding.
"""
from collections.abc import Iterator
from typing import Any
import cv2
import logging

logger = logging.getLogger(__name__)

class VideoProvider:
    """Handles stable video file reading and frame extraction."""

    def __init__(self, video_path: str, step: int = 1) -> None:
        self.path = video_path
        self.step = step

        self.cap = cv2.VideoCapture(
            video_path,
            cv2.CAP_FFMPEG,
            [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_ANY]
        )

        if not self.cap.isOpened():
             self.cap = cv2.VideoCapture(video_path)

        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 25.0

    def __iter__(self) -> Iterator[tuple[int, float, Any]]:
        """Yields frame index, timestamp, and contiguous frame data."""
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
        """Releases the underlying video decoding resources safely."""
        if self.cap:
            self.cap.release()
