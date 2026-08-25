import av
import numpy as np
import logging
from typing import Tuple
from fractions import Fraction

logger = logging.getLogger(__name__)


def _resolve_encoder(requested: str) -> str:
    """Pick a PyAV-available encoder; stock wheels ship without NVENC."""
    if requested == "libx264":
        return "libx264"
    if requested in ("auto", "nvenc") and "h264_nvenc" in av.codecs_available:
        return "h264_nvenc"
    if requested in ("auto", "nvenc"):
        logger.info("h264_nvenc unavailable in PyAV; using libx264")
    return "libx264"


class AsyncVideoWriter:
    """Writes video frames with optional bounded async encode queue.

    Encoding runs in-thread by default to avoid PyAV cross-thread deadlocks and
    huge RAM spikes from buffering full-resolution frames.
    """

    def __init__(self, path: str, fps: float, size: Tuple[int, int], encoder: str = "auto"):
        self.path = path
        self.container = av.open(path, "w")
        selected_encoder = _resolve_encoder(encoder)
        safe_fps = Fraction(fps).limit_denominator(100000)

        self.stream = self.container.add_stream(selected_encoder, rate=safe_fps)
        self.stream.width = size[0]
        self.stream.height = size[1]
        self.stream.pix_fmt = "yuv420p"

        if selected_encoder == "h264_nvenc":
            self.stream.options = {"preset": "p6", "tune": "hq", "cq": "23"}
        else:
            self.stream.options = {"preset": "veryfast", "crf": "21"}

        self._closed = False
        logger.info("VideoWriter ready: %s %dx%d @ %s", selected_encoder, size[0], size[1], safe_fps)

    def write(self, frame: np.ndarray):
        """Encode and mux a single BGR frame."""
        if self._closed:
            raise RuntimeError("Writer is closed")
        av_frame = av.VideoFrame.from_ndarray(frame, format="bgr24")
        for packet in self.stream.encode(av_frame):
            self.container.mux(packet)

    def close(self):
        """Flush encoder and close the container."""
        if self._closed:
            return
        self._closed = True
        try:
            for packet in self.stream.encode():
                self.container.mux(packet)
        except Exception:
            pass
        self.container.close()
