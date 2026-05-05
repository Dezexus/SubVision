import logging
import json
import time
import asyncio
import tempfile
import os
from typing import Dict, Any
import redis
from arq.connections import RedisSettings

from core.config import settings
from core.storage import storage_manager
from core.exceptions import TaskCancelledError
from processing.pipeline import run_ocr_pipeline
from processing.interfaces import OCRReporter
from rendering.pipeline import render_blur_pipeline
from rendering.interfaces import Reporter, Storage, CancellationToken
from rendering.models import RenderTaskConfig

_redis_pool = None

def _get_redis_pool():
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool.from_url(settings.redis_url, max_connections=10)
    return _redis_pool

class RedisCancellationToken:
    def __init__(self, job_id: str, redis_conn: redis.Redis) -> None:
        self._job_id = job_id
        self._redis = redis_conn

    async def is_cancelled(self) -> bool:
        try:
            flag = await self._redis.get(f"job:{self._job_id}:cancel")
            return bool(flag)
        except Exception:
            return False

    def is_cancelled_sync(self) -> bool:
        try:
            flag = self._redis.get(f"job:{self._job_id}:cancel")
            return bool(flag)
        except Exception:
            return False

async def publish_ws(ctx: Dict[str, Any], client_id: str, job_id: str, payload: Dict[str, Any]) -> None:
    redis_conn = ctx['redis']
    payload['job_id'] = job_id
    await redis_conn.publish(f"ws_{client_id}", json.dumps(payload))

class ProgressReporter:
    def __init__(self, client_id: str, job_id: str, redis_client: redis.Redis) -> None:
        self._client_id = client_id
        self._job_id = job_id
        self._redis = redis_client
        self._last_progress = None
        self._throttle_interval = 0.2
        self._throttle_ts = 0.0
        self._total = 0

    def set_total(self, total: int) -> None:
        self._total = total

    def _send(self, payload: dict) -> None:
        payload['job_id'] = self._job_id
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

async def process_ocr_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config['client_id']
    filename = config['filename']
    safe_filename = os.path.basename(filename)
    job_id = ctx.get('job_id', 'unknown')

    r = redis.Redis(connection_pool=_get_redis_pool())
    reporter = ProgressReporter(client_id, job_id, r)
    cancellation = RedisCancellationToken(job_id, r)

    with tempfile.TemporaryDirectory() as tmpdir:
        local_video_path = os.path.join(tmpdir, safe_filename)

        reporter.log("Downloading video from storage...")

        dl_ok = await storage_manager.download_file(safe_filename, local_video_path)
        if not dl_ok:
            await publish_ws(ctx, client_id, job_id, {
                "type": "finish",
                "success": False,
                "error": "Source video file is no longer available. It may have been deleted."
            })
            r.close()
            return

        success = await asyncio.to_thread(
            run_ocr_pipeline,
            local_video_path,
            config,
            reporter,
            cancellation.is_cancelled_sync
        )

        if success:
            reporter.done()
            await publish_ws(ctx, client_id, job_id, {"type": "finish", "success": True})
        else:
            r.close()
            raise RuntimeError("OCR pipeline execution failed or was interrupted.")
    r.close()

class RedisReporter:
    def __init__(self, client_id: str, job_id: str, redis_conn: redis.Redis) -> None:
        self._client_id = client_id
        self._job_id = job_id
        self._redis = redis_conn

    async def _send(self, payload: dict) -> None:
        payload['job_id'] = self._job_id
        await self._redis.publish(f"ws_{self._client_id}", json.dumps(payload))

    async def log(self, message: str) -> None:
        await self._send({"type": "log", "message": message})

    async def progress(self, current: int, total: int, eta: str) -> None:
        await self._send({"type": "progress", "current": current, "total": total, "eta": eta})

    async def done(self, total: int) -> None:
        await self._send({"type": "progress", "current": total, "total": total, "eta": "00:00"})

class StorageAdapter:
    async def download(self, key: str, dest: str) -> bool:
        return await storage_manager.download_file(key, dest)

    async def upload(self, src: str, key: str) -> bool:
        return await storage_manager.upload_file(src, key)

async def startup(ctx: Dict[str, Any]) -> None:
    logging.info("Worker starting up...")

async def shutdown(ctx: Dict[str, Any]) -> None:
    logging.info("Worker shutting down...")
    global _redis_pool
    if _redis_pool:
        _redis_pool.disconnect()

async def render_blur_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config['client_id']
    job_id = ctx.get('job_id', 'unknown')

    redis_conn = ctx['redis']
    reporter = RedisReporter(client_id, job_id, redis_conn)
    storage = StorageAdapter()
    cancellation = RedisCancellationToken(job_id, redis_conn)

    task_config = RenderTaskConfig(**config)

    safe_filename = os.path.basename(task_config.filename)
    local_video_path = os.path.join(tempfile.gettempdir(), safe_filename)

    dl_ok = await storage.download(safe_filename, local_video_path)
    if not dl_ok:
        await reporter.log("Error: source video missing")
        await redis_conn.publish(f"ws_{client_id}", json.dumps({
            "type": "finish",
            "success": False,
            "error": "Source video file is no longer available. It may have been deleted.",
            "job_id": job_id
        }))
        return

    output_filename = await render_blur_pipeline(task_config, storage, reporter, cancellation)

    finish_payload = {
        "type": "finish",
        "success": True,
        "download_url": f"/api/video/download/{output_filename}",
        "job_id": job_id
    }
    await redis_conn.publish(f"ws_{client_id}", json.dumps(finish_payload))

async def on_job_end_handler(ctx: Dict[str, Any], job_id: str, result: Any, exc: Exception) -> None:
    if exc is not None:
        logging.error(f"Job {job_id} failed critically: {exc}")
        try:
            if "_" in job_id:
                client_id = job_id.split("_", 1)[1]
            else:
                client_id = "unknown"
            error_payload = {
                "type": "finish",
                "success": False,
                "error": f"Task Failed: {str(exc)}",
                "job_id": job_id
            }
            await ctx['redis'].publish(f"ws_{client_id}", json.dumps(error_payload))
        except Exception as e:
            logging.error(f"Failed to publish error state for {job_id}: {e}")

class WorkerSettings:
    functions = [process_ocr_task, render_blur_task]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    on_shutdown = shutdown
    after_job_ends = on_job_end_handler
    max_jobs = 1
    job_timeout = 86400