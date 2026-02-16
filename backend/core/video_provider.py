"""
This module defines the VideoProvider class, a utility for iterating
through video frames with a specified step.
"""
from collections.abc import Iterator
import cv2
import numpy as np

class VideoProvider:
    """
    Handles video file reading and provides an iterator to efficiently
    access frames at a given interval.
    """

    def __init__(self, video_path: str, step: int = 1) -> None:
        """
        Initializes the video provider.

        Args:
            video_path: The path to the video file.
            step: The interval at which to process frames (e.g., step=2 processes every other frame).
        """
        self.path = video_path
        self.step = step
        self.cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 25.0
        self.frame_idx = 0

    def __iter__(self) -> Iterator[tuple[int, float, np.ndarray]]:
        """
        Provides an iterator that yields frames from the video.

        Yields:
            A tuple containing the frame index (int), timestamp in seconds (float),
            and the frame image as a NumPy array.
        """
        while self.cap.isOpened():
            ok, frame = self.cap.read()
            if not ok:
                break

            if self.frame_idx % self.step == 0:
                msec = self.cap.get(cv2.CAP_PROP_POS_MSEC)
                timestamp = msec / 1000.0 if msec > 0 else self.frame_idx / self.fps
                yield self.frame_idx, timestamp, frame

            self.frame_idx += 1

    def release(self) -> None:
        """Releases the underlying video capture resource."""
        if self.cap:
            self.cap.release()
