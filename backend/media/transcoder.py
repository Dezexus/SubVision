"""
Module for ffmpeg encoding with GPU acceleration selection.
"""
import logging
import subprocess
from typing import Optional, Tuple, IO

logger = logging.getLogger(__name__)


class FFmpegTranscoder:
    """Provides methods for single-pass encoding with audio muxing."""

    _nvenc_available: Optional[bool] = None

    @staticmethod
    def check_nvenc() -> bool:
        """Detect if h264_nvenc encoder is available, with caching."""
        if FFmpegTranscoder._nvenc_available is None:
            try:
                result = subprocess.run(
                    ["ffmpeg", "-encoders"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                )
                FFmpegTranscoder._nvenc_available = "h264_nvenc" in result.stdout
            except Exception:
                FFmpegTranscoder._nvenc_available = False
        return FFmpegTranscoder._nvenc_available

    @staticmethod
    def encode_with_audio_pipe(
        original_video_path: str,
        output_path: str,
        fps: float,
        width: int,
        height: int,
        dar: Optional[float] = None,
    ) -> Tuple[subprocess.Popen, IO[bytes]]:
        """Launch ffmpeg to encode rawvideo from stdin and mux audio from original file."""
        use_nvenc = FFmpegTranscoder.check_nvenc()
        if use_nvenc:
            video_codec = ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23"]
        else:
            video_codec = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23"]
        audio_codec = ["-c:a", "copy"]

        cmd = [
            "ffmpeg", "-y",
            "-f", "rawvideo", "-vcodec", "rawvideo",
            "-s", f"{width}x{height}",
            "-pix_fmt", "bgr24",
            "-r", str(fps),
            "-i", "-",
            "-i", original_video_path,
            "-map", "0:v:0",
            "-map", "1:a:0?",
        ]
        if dar is not None:
            cmd.extend(["-aspect", f"{dar:.6f}"])
        cmd += video_codec
        cmd += audio_codec
        cmd.append(output_path)

        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        return proc, proc.stdin