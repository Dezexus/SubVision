"""
Module handling asynchronous FFmpeg subprocess execution and video transcoding.
"""
import asyncio
import os
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)


class FFmpegTranscoder:
    """
    Provides methods to execute FFmpeg commands safely utilizing asyncio cancellation.
    """

    @staticmethod
    async def run_cmd(cmd: List[str]) -> None:
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        try:
            await process.wait()
        except asyncio.CancelledError:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                process.kill()
            raise

        if process.returncode != 0:
            raise RuntimeError(f"Command failed with code {process.returncode}")

    @staticmethod
    async def transcode_with_audio(temp_video: str, original_video: str, output_path: str, dar: Optional[float] = None) -> str:
        logger.info("Transcoding to H.264 using NVENC and attempting audio copy...")

        base_cmd = [
            "ffmpeg", "-y",
            "-i", temp_video,
            "-i", original_video,
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-shortest"
        ]

        if dar is not None:
            base_cmd.extend(["-aspect", f"{dar:.6f}"])

        nvenc_params = ["-c:v", "h264_nvenc", "-preset", "p4", "-cq", "23", "-pix_fmt", "yuv420p"]
        x264_params = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p"]

        try:
            await FFmpegTranscoder.run_cmd(base_cmd + nvenc_params + ["-c:a", "copy", output_path])
        except RuntimeError:
            try:
                logger.warning("NVENC audio copy failed, falling back to AAC with NVENC...")
                await FFmpegTranscoder.run_cmd(base_cmd + nvenc_params + ["-c:a", "aac", output_path])
            except RuntimeError:
                logger.warning("NVENC encoding failed, falling back to software libx264...")
                await FFmpegTranscoder.run_cmd(base_cmd + x264_params + ["-c:a", "aac", output_path])

        if os.path.exists(temp_video):
            os.remove(temp_video)

        return output_path