import functools
import logging
import shutil
import subprocess
import tempfile
from fractions import Fraction
from typing import List, Optional, Tuple

import av
import numpy as np

logger = logging.getLogger(__name__)

_NVENC_OPTIONS = {"preset": "p6", "tune": "hq", "cq": "23"}
_X264_OPTIONS = {"preset": "veryfast", "crf": "21"}


@functools.lru_cache(maxsize=1)
def _ffmpeg_cli_has_nvenc() -> bool:
    """Probe once whether the system ffmpeg can actually encode with NVENC.

    Stock PyAV wheels bundle an ffmpeg without NVENC, while the worker image's
    system ffmpeg has it. Listing the encoder is not enough: it needs a GPU and
    a driver at runtime, so encode a single frame.
    """
    if shutil.which("ffmpeg") is None:
        return False
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=black:s=256x256:d=0.1",
        "-frames:v",
        "1",
        "-c:v",
        "h264_nvenc",
        "-f",
        "null",
        "-",
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=30)
    except (OSError, subprocess.SubprocessError) as e:
        logger.info("ffmpeg NVENC probe failed: %s", e)
        return False
    if result.returncode != 0:
        logger.info("ffmpeg NVENC probe failed: %s", result.stderr.decode(errors="replace").strip()[-500:])
        return False
    return True


def _resolve_encoder(requested: str) -> Tuple[str, str]:
    """Return (backend, encoder) where backend is "pyav" or "ffmpeg"."""
    if requested in ("auto", "nvenc"):
        if "h264_nvenc" in av.codecs_available:
            return "pyav", "h264_nvenc"
        if _ffmpeg_cli_has_nvenc():
            return "ffmpeg", "h264_nvenc"
        logger.info("h264_nvenc unavailable in PyAV and system ffmpeg; using libx264")
    return "pyav", "libx264"


class AsyncVideoWriter:
    """Writes BGR frames to a video file.

    Encoding runs in-thread to avoid PyAV cross-thread deadlocks and RAM spikes
    from buffering full-resolution frames. When PyAV lacks NVENC but the system
    ffmpeg has it, frames are piped to an ffmpeg subprocess instead.
    """

    def __init__(self, path: str, fps: float, size: Tuple[int, int], encoder: str = "auto"):
        self.path = path
        self.size = size
        self._closed = False
        self._proc: Optional[subprocess.Popen] = None
        self._stderr = None
        backend, selected_encoder = _resolve_encoder(encoder)
        safe_fps = Fraction(fps).limit_denominator(100000)

        if backend == "ffmpeg":
            self._open_ffmpeg(safe_fps, selected_encoder)
        else:
            self.container = av.open(path, "w")
            self.stream = self.container.add_stream(selected_encoder, rate=safe_fps)
            self.stream.width = size[0]
            self.stream.height = size[1]
            self.stream.pix_fmt = "yuv420p"
            self.stream.options = _NVENC_OPTIONS if selected_encoder == "h264_nvenc" else _X264_OPTIONS

        logger.info("VideoWriter ready: %s (%s) %dx%d @ %s", selected_encoder, backend, size[0], size[1], safe_fps)

    def _open_ffmpeg(self, fps: Fraction, encoder: str) -> None:
        width, height = self.size
        cmd: List[str] = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "bgr24",
            "-s",
            f"{width}x{height}",
            "-r",
            f"{fps.numerator}/{fps.denominator}",
            "-i",
            "pipe:0",
            "-c:v",
            encoder,
            "-pix_fmt",
            "yuv420p",
        ]
        for key, value in _NVENC_OPTIONS.items():
            cmd.extend([f"-{key}", value])
        cmd.append(self.path)
        # stderr goes to a file so a chatty ffmpeg can never block on a full pipe.
        self._stderr = tempfile.TemporaryFile()
        self._proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=self._stderr)

    def _ffmpeg_error(self, prefix: str) -> RuntimeError:
        details = ""
        if self._stderr is not None:
            self._stderr.seek(0)
            details = self._stderr.read().decode("utf-8", errors="replace").strip()[-2000:]
        return RuntimeError(f"{prefix}: {details}" if details else prefix)

    def write(self, frame: np.ndarray):
        """Encode and mux a single BGR frame."""
        if self._closed:
            raise RuntimeError("Writer is closed")
        if self._proc is not None:
            try:
                self._proc.stdin.write(np.ascontiguousarray(frame).tobytes())
            except (BrokenPipeError, OSError) as e:
                self._proc.wait()
                raise self._ffmpeg_error(f"ffmpeg encoder exited with code {self._proc.returncode}") from e
            return
        av_frame = av.VideoFrame.from_ndarray(frame, format="bgr24")
        for packet in self.stream.encode(av_frame):
            self.container.mux(packet)

    def close(self):
        """Flush encoder and close the output."""
        if self._closed:
            return
        self._closed = True
        if self._proc is not None:
            try:
                try:
                    self._proc.stdin.close()
                except (BrokenPipeError, OSError):
                    pass
                self._proc.wait()
                if self._proc.returncode != 0:
                    raise self._ffmpeg_error(f"ffmpeg encoder exited with code {self._proc.returncode}")
            finally:
                if self._stderr is not None:
                    self._stderr.close()
            return
        try:
            for packet in self.stream.encode():
                self.container.mux(packet)
        finally:
            self.container.close()
