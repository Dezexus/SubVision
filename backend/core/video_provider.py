from collections.abc import Iterator
import cv2
import numpy as np

class VideoProvider:
    """Handles video file reading and frame iteration."""

    def __init__(self, video_path: str, step: int = 1) -> None:
        self.path = video_path
        self.step = step
        self.cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])
        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 25.0
        self.frame_idx = 0

    def __iter__(self) -> Iterator[tuple[int, float, np.ndarray]]:
        while self.cap.isOpened():
            ok, frame = self.cap.read()
            if not ok:
                break

            if self.frame_idx % self.step == 0:
                msec = self.cap.get(cv2.CAP_PROP_POS_MSEC)
                if msec > 0:
                    timestamp = msec / 1000.0
                else:
                    timestamp = self.frame_idx / self.fps

                yield self.frame_idx, timestamp, frame

            self.frame_idx += 1

    def release(self) -> None:
        """Releases the video capture resource."""
        self.cap.release()
