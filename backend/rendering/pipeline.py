import asyncio
import logging
import os
import tempfile
import time
from typing import List

from rendering.interfaces import Reporter, Storage, CancellationToken
from rendering.models import RenderTaskConfig
from rendering.effects.interface import Effect
from rendering.video_writer import AsyncVideoWriter
from core.exceptions import TaskCancelledError
from core.video_io import get_video_dar, get_video_metadata, iter_frames

logger = logging.getLogger(__name__)

def _process_frames_sync(
    local_video_path: str,
    total_frames: int,
    fps: float,
    width: int,
    height: int,
    effects: List[Effect],
    writer: AsyncVideoWriter,
    reporter: Reporter,
    cancellation: CancellationToken
) -> int:
    """Synchronous core frame processing loop."""
    frame_idx = 0
    for f_idx, _, frame in iter_frames(local_video_path, step=1, fps=fps, total=total_frames, width=width, height=height, use_hwaccel=True):
        if cancellation.is_cancelled_sync():
            raise TaskCancelledError("User cancelled during frame writing")

        for effect in effects:
            frame = effect.apply(frame, f_idx)

        writer.write(frame)

        if frame_idx > 0 and frame_idx % 25 == 0:
            reporter.progress(frame_idx, total_frames, "N/A")

        frame_idx += 1

    reporter.progress(total_frames, total_frames, "00:00")
    reporter.done(total_frames)
    return frame_idx

async def render_blur_pipeline(
    task_config: RenderTaskConfig,
    storage: Storage,
    reporter: Reporter,
    cancellation: CancellationToken,
) -> str:
    """Executes the complete blur rendering pipeline using PyAV hardware acceleration."""
    filename = task_config.filename
    safe_filename = os.path.basename(filename)
    output_filename = f"blurred_{safe_filename}"

    overall_start = time.time()

    with tempfile.TemporaryDirectory() as tmpdir:
        local_video_path = os.path.join(tmpdir, safe_filename)
        final_output_path = os.path.join(tmpdir, output_filename)

        reporter.log("Downloading video from storage...")
        dl_start = time.time()
        dl_ok = await storage.download(safe_filename, local_video_path)
        dl_time = time.time() - dl_start
        logger.info(f"Video download completed in {dl_time:.2f} seconds")

        if not dl_ok:
            raise FileNotFoundError(f"Source video file '{safe_filename}' not found in storage.")

        if cancellation.is_cancelled_sync():
            raise TaskCancelledError("User cancelled before processing")

        meta = await asyncio.to_thread(get_video_metadata, local_video_path)
        width = meta["width"]
        height = meta["height"]
        fps = meta["fps"]
        total_frames = meta["total_frames"]

        effects: List[Effect] = task_config.build_effects()

        for effect in effects:
            await effect.prepare(
                subtitles=task_config.subtitles,
                width=width,
                height=height,
                fps=fps,
                total_frames=total_frames,
                video_path=local_video_path,
            )

        writer = AsyncVideoWriter(final_output_path, fps, (width, height), task_config.blur_settings.encoder, local_video_path)

        try:
            frame_idx = await asyncio.to_thread(
                _process_frames_sync,
                local_video_path,
                total_frames,
                fps,
                width,
                height,
                effects,
                writer,
                reporter,
                cancellation
            )
        finally:
            await asyncio.to_thread(writer.close)

        logger.info(f"Frame writing completed ({frame_idx} frames)")

        if cancellation.is_cancelled_sync():
            raise TaskCancelledError("User cancelled after writing")

        reporter.log("Uploading result...")
        up_ok = await storage.upload(final_output_path, output_filename)
        if not up_ok:
            raise RuntimeError("Failed to upload the final rendered video to storage.")

        total_elapsed = time.time() - overall_start
        logger.info(f"Total render time: {total_elapsed:.2f} seconds")

        return output_filename