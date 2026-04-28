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
import redis
from arq.connections import RedisSettings

from core.config import settings
from core.storage import storage_manager
from core.video_io import get_video_dar
from media.blur_manager import BlurManager
from ocr.worker import run_ocr_pipeline


_redis_pool = None


def _get_redis_pool():
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool.from_url(settings.redis_url, max_connections=10)
    return _redis_pool


async def startup(ctx: Dict[str, Any]) -> None:
    logging.info("Worker starting up...")


async def shutdown(ctx: Dict[str, Any]) -> None:
    logging.info("Worker shutting down...")
    global _redis_pool
    if _redis_pool:
        _redis_pool.disconnect()


async def publish_ws(ctx: Dict[str, Any], client_id: str, payload: Dict[str, Any]) -> None:
    redis_conn = ctx['redis']
    await redis_conn.publish(f"ws_{client_id}", json.dumps(payload))


async def on_job_end_handler(ctx: Dict[str, Any], job_id: str, result: Any, exc: Exception) -> None:
    if exc is not None:
        logging.error(f"Job {job_id} failed critically: {exc}")
        try:
            if "_" in job_id:
                client_id = job_id.split("_", 1)[1]
            else:
                client_id = "unknown"
                logging.warning("Cannot extract client_id from job_id, using 'unknown'")
            await publish_ws(ctx, client_id, {
                "type": "finish",
                "success": False,
                "error": f"Task Failed: {str(exc)}"
            })
        except Exception as e:
            logging.error(f"Failed to publish error state for {job_id}: {e}")


class ProgressReporter:
    """Sends progress updates via a reusable Redis connection."""

    def __init__(self, client_id: str, redis_client: redis.Redis) -> None:
        self._client_id = client_id
        self._redis = redis_client
        self._last_progress = None
        self._throttle_interval = 0.2
        self._throttle_ts = 0.0
        self._total = 0

    def set_total(self, total: int) -> None:
        self._total = total

    def _send(self, payload: dict) -> None:
        self._redis.publish(f"ws_{self._client_id}", json.dumps(payload))

    def log(self, message: str) -> None:
        self._send({"type": "log", "message": message})

    def progress(self, current: int, total: int, eta: str) -> None:
        now = time.time()
        if now - self._throttle_ts >= self._throttle_interval:
            self._throttle_ts = now
            self._send({"type": "progress", "current": current, "total": total, "eta": eta})
        self._last_progress = {"type": "progress", "current": current, "total": total, "eta": eta}

    def subtitle(self, item: Dict[str, Any]) -> None:
        self._send({"type": "subtitle_new", "item": item})

    def done(self) -> None:
        payload = {"type": "progress", "current": self._total, "total": self._total, "eta": "00:00"}
        self._send(payload)


def _make_cancel_check(job_id: str, redis_client: redis.Redis):
    def check() -> bool:
        try:
            flag = redis_client.get(f"job:{job_id}:cancel")
            return bool(flag)
        except Exception:
            return False
    return check


async def process_ocr_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config['client_id']
    filename = config['filename']
    safe_filename = os.path.basename(filename)
    job_id = ctx.get('job_id', 'unknown')

    r = redis.Redis(connection_pool=_get_redis_pool())
    reporter = ProgressReporter(client_id, r)
    cancel_check = _make_cancel_check(job_id, r)

    with tempfile.TemporaryDirectory() as tmpdir:
        local_video_path = os.path.join(tmpdir, safe_filename)

        reporter.log("Downloading video from storage...")

        dl_ok = await storage_manager.download_file(safe_filename, local_video_path)
        if not dl_ok:
            r.close()
            raise FileNotFoundError(f"Source video file '{safe_filename}' not found in storage.")

        success = await asyncio.to_thread(
            run_ocr_pipeline, local_video_path, config, reporter, cancel_check
        )

        if success:
            reporter.done()
            await publish_ws(ctx, client_id, {"type": "finish", "success": True})
        else:
            r.close()
            raise RuntimeError("OCR pipeline execution failed or was interrupted.")
    r.close()


async def render_blur_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config['client_id']
    filename = config['filename']
    safe_filename = os.path.basename(filename)
    output_filename = f"blurred_{safe_filename}"
    job_id = ctx.get('job_id', 'unknown')

    r = redis.Redis(connection_pool=_get_redis_pool())
    reporter = ProgressReporter(client_id, r)
    cancel_check = _make_cancel_check(job_id, r)

    with tempfile.TemporaryDirectory() as tmpdir:
        local_video_path = os.path.join(tmpdir, safe_filename)
        final_output_path = os.path.join(tmpdir, output_filename)

        reporter.log("Downloading video from storage...")

        dl_ok = await storage_manager.download_file(safe_filename, local_video_path)
        if not dl_ok:
            r.close()
            raise FileNotFoundError(f"Source video file '{safe_filename}' not found in storage.")

        dar = await asyncio.to_thread(get_video_dar, local_video_path)

        start_time = time.time()

        def prog_cb(c: int, t: int) -> None:
            elapsed = time.time() - start_time
            eta_sec = int((t - c) * (elapsed / max(c, 1)))
            eta_str = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
            reporter.progress(c, t, eta_str)

        total_frames = await asyncio.to_thread(
            BlurManager.apply_blur_task_sync,
            local_video_path, config['subtitles'], config['blur_settings'],
            final_output_path, prog_cb, cancel_check, dar=dar
        )
        reporter.set_total(total_frames)
        reporter.done()

        reporter.log("Uploading result...")

        up_ok = await storage_manager.upload_file(final_output_path, output_filename)
        if not up_ok:
            r.close()
            raise RuntimeError("Failed to upload the final rendered video to storage.")

        await publish_ws(ctx, client_id, {
            "type": "finish",
            "success": True,
            "download_url": f"/api/video/download/{output_filename}"
        })
    r.close()


class WorkerSettings:
    functions = [process_ocr_task, render_blur_task]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    on_shutdown = shutdown
    after_job_ends = on_job_end_handler
    max_jobs = 1
    job_timeout = 86400