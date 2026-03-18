"""
Entry point for the ARQ background worker managing ML and video rendering tasks.
"""
import logging
import os
import json
import time
import asyncio
import tempfile
from typing import Dict, Any
from arq.connections import RedisSettings

from core.config import settings
from core.storage import storage_manager
from core.video_io import get_video_dar
from media.blur_manager import BlurManager
from media.transcoder import FFmpegTranscoder
from ocr.worker import run_ocr_pipeline


async def startup(ctx: Dict[str, Any]) -> None:
    logging.info("Worker starting up...")


async def shutdown(ctx: Dict[str, Any]) -> None:
    logging.info("Worker shutting down...")


async def publish_ws(ctx: Dict[str, Any], client_id: str, payload: Dict[str, Any]) -> None:
    redis = ctx['redis']
    await redis.publish(f"ws_{client_id}", json.dumps(payload))


async def on_job_end_handler(ctx: Dict[str, Any], job_id: str, result: Any, exc: Exception) -> None:
    if exc is not None:
        logging.error(f"Job {job_id} failed critically: {exc}")
        try:
            client_id = job_id.split("_", 1)[-1]
            await publish_ws(ctx, client_id, {
                "type": "finish",
                "success": False,
                "error": f"Task Failed: {str(exc)}"
            })
        except Exception as e:
            logging.error(f"Failed to publish error state for {job_id}: {e}")


async def process_ocr_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config['client_id']
    filename = config['filename']
    safe_filename = os.path.basename(filename)

    loop = asyncio.get_running_loop()

    with tempfile.TemporaryDirectory() as tmpdir:
        local_video_path = os.path.join(tmpdir, safe_filename)

        await publish_ws(ctx, client_id, {"type": "log", "message": "Downloading video from storage..."})

        dl_ok = await storage_manager.download_file(safe_filename, local_video_path)
        if not dl_ok:
            raise FileNotFoundError(f"Source video file '{safe_filename}' not found in storage.")

        def log_cb(msg: str) -> None:
            asyncio.run_coroutine_threadsafe(publish_ws(ctx, client_id, {"type": "log", "message": msg}), loop)

        def prog_cb(c: int, t: int, e: str) -> None:
            asyncio.run_coroutine_threadsafe(publish_ws(ctx, client_id, {"type": "progress", "current": c, "total": t, "eta": e}), loop)

        def sub_cb(item: Dict[str, Any]) -> None:
            asyncio.run_coroutine_threadsafe(publish_ws(ctx, client_id, {"type": "subtitle_new", "item": item}), loop)

        def cancel_check() -> bool:
            return False

        success = await asyncio.to_thread(
            run_ocr_pipeline, local_video_path, config, log_cb, prog_cb, sub_cb, cancel_check
        )

        if success:
            await publish_ws(ctx, client_id, {"type": "finish", "success": True})
        else:
            raise RuntimeError("OCR pipeline execution failed or was interrupted.")


async def render_blur_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config['client_id']
    filename = config['filename']
    safe_filename = os.path.basename(filename)
    output_filename = f"blurred_{safe_filename}"

    loop = asyncio.get_running_loop()

    with tempfile.TemporaryDirectory() as tmpdir:
        local_video_path = os.path.join(tmpdir, safe_filename)
        final_output_path = os.path.join(tmpdir, output_filename)

        await publish_ws(ctx, client_id, {"type": "log", "message": "Downloading video from storage..."})

        dl_ok = await storage_manager.download_file(safe_filename, local_video_path)
        if not dl_ok:
            raise FileNotFoundError(f"Source video file '{safe_filename}' not found in storage.")

        dar = await asyncio.to_thread(get_video_dar, local_video_path)

        start_time = time.time()

        def prog_cb(c: int, t: int) -> None:
            elapsed = time.time() - start_time
            eta_sec = int((t - c) * (elapsed / max(c, 1)))
            eta_str = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
            asyncio.run_coroutine_threadsafe(
                publish_ws(ctx, client_id, {"type": "progress", "current": c, "total": t, "eta": eta_str}),
                loop
            )

        def cancel_check() -> bool:
            return False

        temp_video_path = await asyncio.to_thread(
            BlurManager.apply_blur_task_sync,
            local_video_path, config['subtitles'], config['blur_settings'],
            final_output_path, prog_cb, cancel_check
        )

        await publish_ws(ctx, client_id, {"type": "log", "message": "Transcoding audio and video..."})
        await FFmpegTranscoder.transcode_with_audio(temp_video_path, local_video_path, final_output_path, dar=dar)

        await publish_ws(ctx, client_id, {"type": "log", "message": "Uploading result..."})

        up_ok = await storage_manager.upload_file(final_output_path, output_filename)
        if not up_ok:
            raise RuntimeError("Failed to upload the final rendered video to storage.")

        await publish_ws(ctx, client_id, {
            "type": "finish",
            "success": True,
            "download_url": f"/api/video/download/{output_filename}"
        })


class WorkerSettings:
    functions = [process_ocr_task, render_blur_task]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    on_shutdown = shutdown
    after_job_ends = on_job_end_handler
    max_jobs = 1
    job_timeout = 86400