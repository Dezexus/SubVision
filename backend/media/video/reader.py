"""
Module providing video reading mechanisms.
"""
from collections.abc import Iterator
from typing import Any
import cv2
import logging

from core.video_io import create_video_capture, iter_frames_ffmpeg
from core.constants import DEFAULT_FPS

logger = logging.getLogger(__name__)


class VideoProvider:
    """
    Handles stable video file reading and frame extraction with software fallback.
    """

    def __init__(self, video_path: str, step: int = 1) -> None:
        self.video_path = video_path
        self.step = step
        self.cap = create_video_capture(video_path)

        if not self.cap.isOpened():
            raise FileNotFoundError(f"OpenCV could not read or open the video file: {video_path}")

        self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT))
        self.fps = self.cap.get(cv2.CAP_PROP_FPS) or DEFAULT_FPS

    def __iter__(self) -> Iterator[tuple[int, float, Any]]:
        frame_idx = 0
        consecutive_errors = 0
        max_consecutive_errors = 100
        ffmpeg_fallback = False

        while self.cap.isOpened() and not ffmpeg_fallback:
            ok, frame = self.cap.read()
            if not ok:
                consecutive_errors += 1
                logger.warning("Frame read failed at index %d, consecutive errors: %d", frame_idx, consecutive_errors)
                if consecutive_errors > max_consecutive_errors:
                    logger.warning("Too many consecutive errors, switching to ffmpeg pipe")
                    ffmpeg_fallback = True
                    break
                frame_idx += 1
                continue
            consecutive_errors = 0

            if frame_idx % self.step == 0:
                msec = self.cap.get(cv2.CAP_PROP_POS_MSEC)
                timestamp = msec / 1000.0 if msec > 0 else frame_idx / self.fps
                yield frame_idx, timestamp, frame

            frame_idx += 1

        if ffmpeg_fallback:
            self.release()
            logger.info("Starting ffmpeg pipe fallback for %s", self.video_path)
            for f_idx, ts, frm in iter_frames_ffmpeg(self.video_path, step=self.step, fps=self.fps, total=self.total_frames):
                yield f_idx, ts, frm

    def release(self) -> None:
        if self.cap:
            self.cap.release()