"""
This module defines the VideoProvider class, a utility for iterating
through video frames with a specified step using hardware acceleration.
"""
from collections.abc import Iterator
from typing import Any
import cv2
import numpy as np
import logging

try:
    import PyNvVideoCodec as nvc
    from paddle.utils.dlpack import from_dlpack
    HAS_NVC = True
except (ImportError, RuntimeError, Exception) as e:
    logging.getLogger(__name__).warning(f"PyNvVideoCodec import failed: {e}")
    HAS_NVC = False

logger = logging.getLogger(__name__)

class VideoProvider:
    """
    Handles video file reading and provides an iterator to efficiently
    access frames at a given interval using NVDEC where possible.
    """

    def __init__(self, video_path: str, step: int = 1) -> None:
        """
        Initializes the video provider.

        Args:
            video_path: The path to the video file.
            step: The interval at which to process frames.
        """
        self.path = video_path
        self.step = step
        self.use_nvc = False
        self.cap = None
        self.nvc_decoder = None

        if HAS_NVC:
            try:
                self.nvc_decoder = nvc.SimpleDecoder(
                    video_path,
                    gpu_id=0,
                    use_device_memory=True,
                    output_color_type=nvc.OutputColorType.RGB
                )
                self.total_frames = len(self.nvc_decoder)

                self.fps = 25.0
                try:
                    meta = self.nvc_decoder.get_stream_metadata()
                    if hasattr(meta, 'avg_framerate_num') and hasattr(meta, 'avg_framerate_den'):
                        num, den = meta.avg_framerate_num, meta.avg_framerate_den
                        self.fps = num / den if den > 0 else 25.0
                    elif hasattr(meta, 'framerate'):
                        fr = meta.framerate
                        if isinstance(fr, (list, tuple)) and len(fr) >= 2:
                            self.fps = fr[0] / fr[1] if fr[1] > 0 else 25.0
                        else:
                            self.fps = float(fr)
                    elif hasattr(meta, 'duration') and meta.duration > 0:
                        self.fps = self.total_frames / meta.duration
                except Exception:
                    try:
                        dmx = nvc.CreateDemuxer(filename=video_path)
                        self.fps = dmx.FrameRate()
                    except:
                        pass

                self.use_nvc = True
                logger.info(f"VideoProvider: Using PyNvVideoCodec (NVDEC). FPS: {self.fps:.2f}")
                return
            except Exception as e:
                logger.warning(f"PyNvVideoCodec init failed: {e}")
                self.use_nvc = False
                self.nvc_decoder = None

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
        """
        Yields:
            Frame index, Timestamp (sec), Frame (Paddle Tensor [GPU] OR Numpy Array [CPU])
        """
        if self.use_nvc and self.nvc_decoder:
            for i in range(0, self.total_frames, self.step):
                try:
                    frame_obj = self.nvc_decoder[i]
                    paddle_tensor = from_dlpack(frame_obj)
                    timestamp = i / self.fps
                    yield i, timestamp, paddle_tensor
                except Exception:
                    continue
        else:
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
        """Releases the underlying video resources."""
        if self.cap:
            self.cap.release()
        self.nvc_decoder = None
