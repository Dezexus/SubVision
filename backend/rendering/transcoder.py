import asyncio
import os
import logging
from typing import List, Optional
from rendering.interfaces import CancellationToken

logger = logging.getLogger(__name__)

class FFmpegTranscoder:
    """Handles video multiplexing and asynchronous command execution."""
    
    @staticmethod
    async def run_cmd(cmd: List[str], cancel: Optional[CancellationToken] = None) -> None:
        """Executes an FFmpeg command asynchronously with cancellation support."""
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )
        try:
            while True:
                if cancel and cancel.is_cancelled_sync():
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
        """Muxes the generated video with the original audio without re-encoding the video stream."""
        logger.info("Muxing video with original audio...")

        cmd = [
            "ffmpeg", "-y",
            "-i", temp_video,
            "-i", original_video,
            "-map", "0:v:0",
            "-map", "1:a:0?",
            "-c:v", "copy",
            "-c:a", "aac",
            "-shortest"
        ]

        if dar is not None:
            cmd.extend(["-aspect", f"{dar:.6f}"])

        cmd.append(output_path)
        
        await FFmpegTranscoder.run_cmd(cmd, cancel=cancel)

        if os.path.exists(temp_video):
            os.remove(temp_video)

        return output_path