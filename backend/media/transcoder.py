"""
Module handling asynchronous FFmpeg subprocess execution and video transcoding.
"""
import asyncio
import os
import logging
import threading
from typing import List

logger = logging.getLogger(__name__)

class FFmpegTranscoder:
    """
    Provides methods to execute FFmpeg commands safely with cancellation support.
    """

    @staticmethod
    async def run_cancellable(cmd: List[str], stop_event: threading.Event) -> None:
        """
        Executes a subprocess and monitors a threading event for early termination.
        """
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )

        while process.returncode is None:
            if stop_event.is_set():
                try:
                    process.terminate()
                    await asyncio.wait_for(process.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    process.kill()
                raise InterruptedError("Process was cancelled by user.")

            try:
                await asyncio.wait_for(process.wait(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

        if process.returncode != 0:
            raise RuntimeError(f"Command failed with code {process.returncode}")

    @staticmethod
    async def transcode_with_audio(
        temp_video: str,
        original_video: str,
        output_path: str,
        stop_event: threading.Event
    ) -> str:
        """
        Merges the processed video stream with the original audio stream using hardware acceleration fallbacks.
        """
        logger.info("Transcoding to H.264 using NVENC and attempting audio copy...")

        base_cmd = [
            "ffmpeg", "-y",
            "-i", temp_video,
            "-i", original_video,
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-shortest"
        ]

        nvenc_params = [
            "-c:v", "h264_nvenc",
            "-preset", "p4",
            "-cq", "23",
            "-pix_fmt", "yuv420p"
        ]

        x264_params = [
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-crf", "23",
            "-pix_fmt", "yuv420p"
        ]

        try:
            cmd_nvenc_copy = base_cmd + nvenc_params + ["-c:a", "copy", output_path]
            await FFmpegTranscoder.run_cancellable(cmd_nvenc_copy, stop_event)
        except RuntimeError:
            try:
                logger.warning("NVENC audio copy failed, falling back to AAC with NVENC...")
                cmd_nvenc_aac = base_cmd + nvenc_params + ["-c:a", "aac", output_path]
                await FFmpegTranscoder.run_cancellable(cmd_nvenc_aac, stop_event)
            except RuntimeError:
                logger.warning("NVENC encoding failed, falling back to software libx264...")
                cmd_x264_aac = base_cmd + x264_params + ["-c:a", "aac", output_path]
                await FFmpegTranscoder.run_cancellable(cmd_x264_aac, stop_event)

        if os.path.exists(temp_video):
            os.remove(temp_video)

        return output_path
