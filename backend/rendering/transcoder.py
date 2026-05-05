import asyncio
import os
import logging
from typing import List, Optional
from rendering.interfaces import CancellationToken

logger = logging.getLogger(__name__)

class FFmpegTranscoder:
    @staticmethod
    async def run_cmd(cmd: List[str], cancel: Optional[CancellationToken] = None) -> None:
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        try:
            while True:
                if cancel and await cancel.is_cancelled():
                    process.terminate()
                    try:
                        await asyncio.wait_for(process.wait(), timeout=2.0)
                    except asyncio.TimeoutError:
                        process.kill()
                        await process.wait()
                    raise asyncio.CancelledError("Transcoding cancelled")
                try:
                    await asyncio.wait_for(process.wait(), timeout=0.5)
                    break
                except asyncio.TimeoutError:
                    continue
        except asyncio.CancelledError:
            if process.returncode is None:
                process.kill()
                await process.wait()
            raise
        finally:
            if process.returncode is None:
                process.kill()
                await process.wait()

        if process.returncode != 0:
            raise RuntimeError(f"Command failed with code {process.returncode}")

    @staticmethod
    async def transcode_with_audio(
        temp_video: str,
        original_video: str,
        output_path: str,
        dar: Optional[float] = None,
        encoder: str = "auto",
        cancel: Optional[CancellationToken] = None
    ) -> str:
        logger.info("Transcoding to H.264...")

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

        async def try_encode(video_params, audio_codec):
            cmd = base_cmd + video_params + ["-c:a", audio_codec, output_path]
            await FFmpegTranscoder.run_cmd(cmd, cancel=cancel)

        if encoder == "nvenc":
            await try_encode(nvenc_params, "copy")
        elif encoder == "libx264":
            await try_encode(x264_params, "aac")
        else:
            try:
                await try_encode(nvenc_params, "copy")
            except RuntimeError:
                try:
                    logger.warning("NVENC audio copy failed, falling back to AAC with NVENC...")
                    await try_encode(nvenc_params, "aac")
                except RuntimeError:
                    logger.warning("NVENC encoding failed, falling back to software libx264...")
                    await try_encode(x264_params, "aac")

        if os.path.exists(temp_video):
            os.remove(temp_video)

        return output_path