import asyncio
import logging
import json
import time
import os
import tempfile
import shutil
from typing import Dict, Any
import redis.asyncio as aioredis
import redis
from arq.connections import RedisSettings
import numpy as np

from subvision.core.config import settings
from subvision.core.logging_config import setup_logging
from subvision.core.storage import storage_manager
from subvision.core.exceptions import TaskCancelledError
from subvision.core.jobs import (
    clear_active_job_if_match,
    parse_client_id_from_job_id,
    touch_active_job,
)
from subvision.processing.pipeline import run_ocr_pipeline
from subvision.processing.ocr_engine import get_paddle_engine
from subvision.rendering.pipeline import render_blur_pipeline
from subvision.rendering.models import RenderTaskConfig
setup_logging(settings.log_level)

_sync_redis_client = None


def get_sync_redis() -> redis.Redis:
    """Retrieve or initialize synchronous Redis client singleton."""
    global _sync_redis_client
    if _sync_redis_client is None:
        _sync_redis_client = redis.Redis.from_url(settings.redis_url)
    return _sync_redis_client


class RedisEventBus:
    """Implementation of the EventBus using Redis Pub/Sub and State Storage."""

    def __init__(self, redis_conn: aioredis.Redis, client_id: str, job_id: str, loop: asyncio.AbstractEventLoop):
        self._redis = redis_conn
        self._client_id = client_id
        self._job_id = job_id
        self._loop = loop

    async def publish_async(self, payload: Dict[str, Any]) -> None:
        payload["job_id"] = self._job_id
        try:
            payload_str = json.dumps(payload, default=str)
            await self._redis.publish(f"ws_{self._client_id}", payload_str)
            msg_type = payload.get("type")
            if msg_type in ("progress", "finish", "error"):
                await self._redis.setex(f"job_status:{self._job_id}", 86400, payload_str)
            if msg_type == "progress":
                await touch_active_job(self._redis, self._client_id, self._job_id)
            # Persist last state for UI recovery. Never let progress overwrite a terminal finish/error.
            if msg_type in ("finish", "error"):
                await self._redis.setex(f"client_last_state:{self._client_id}", 86400, payload_str)
            elif msg_type == "progress":
                existing = await self._redis.get(f"client_last_state:{self._client_id}")
                if existing:
                    try:
                        prev = json.loads(existing)
                        if prev.get("type") in ("finish", "error") and prev.get("job_id") == self._job_id:
                            return
                    except (json.JSONDecodeError, TypeError):
                        pass
                await self._redis.setex(f"client_last_state:{self._client_id}", 86400, payload_str)
        except Exception as e:
            logging.error(f"EventBus publish failed: {e}")

    def publish_sync(self, payload: Dict[str, Any]) -> None:
        if not self._loop.is_closed():
            asyncio.run_coroutine_threadsafe(self.publish_async(payload), self._loop)


class RedisCancellationToken:
    """Token to verify user cancellation via Redis."""

    def __init__(self, job_id: str) -> None:
        self._job_id = job_id
        self._sync_redis = get_sync_redis()
        self._last_check = 0.0
        self._cached_result = False

    async def is_cancelled(self) -> bool:
        return self.is_cancelled_sync()

    def is_cancelled_sync(self) -> bool:
        now = time.time()
        if now - self._last_check > 1.0:
            try:
                self._cached_result = bool(self._sync_redis.exists(f"job:{self._job_id}:cancel"))
            except Exception as e:
                logging.error(f"Sync cancel check failed for {self._job_id}: {e}")
                self._cached_result = False
            self._last_check = now
        return self._cached_result


class TaskReporter:
    """Unified reporter adapter utilizing the EventBus."""

    def __init__(self, bus: RedisEventBus, cancel_token: RedisCancellationToken = None) -> None:
        self._bus = bus
        self._cancel_token = cancel_token
        self._throttle_interval = 0.5
        self._throttle_ts = 0.0
        self._total = 0

    def _check_cancel(self) -> None:
        if self._cancel_token and self._cancel_token.is_cancelled_sync():
            raise TaskCancelledError("Job cancelled by user.")

    def set_total(self, total: int) -> None:
        self._total = total

    def log(self, message: str) -> None:
        self._check_cancel()
        self._bus.publish_sync({"type": "log", "message": message})

    def progress(self, current: int, total: int, eta: str) -> None:
        self._check_cancel()
        if total > 0:
            self._total = total
        now = time.time()
        if now - self._throttle_ts >= self._throttle_interval or current == total:
            self._throttle_ts = now
            self._bus.publish_sync({"type": "progress", "current": current, "total": total, "eta": eta})

    def subtitle(self, item: Dict[str, Any]) -> None:
        self._check_cancel()
        self._bus.publish_sync({"type": "subtitle_new", "item": item})

    def subtitles_replace(self, items: list) -> None:
        """Push the final refined subtitle list after OCR aggregation."""
        self._check_cancel()
        self._bus.publish_sync({"type": "subtitles_replace", "items": items})

    def done(self, total: int = None) -> None:
        self._check_cancel()
        t = total if total is not None else self._total
        if t > 0:
            self._total = t
        self._bus.publish_sync({"type": "progress", "current": self._total or t, "total": self._total or t, "eta": "00:00"})


class StorageAdapter:
    async def copy_from(self, key: str, dest: str) -> bool:
        return await storage_manager.copy_from(key, dest)

    async def copy_to(self, src: str, key: str) -> bool:
        return await storage_manager.copy_to(src, key)


async def process_ocr_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config["client_id"]
    filename = config["filename"]
    safe_filename = os.path.basename(filename)
    job_id = ctx.get("job_id", "unknown")
    redis_conn: aioredis.Redis = ctx["redis"]
    loop = asyncio.get_running_loop()

    bus = RedisEventBus(redis_conn, client_id, job_id, loop)
    cancellation = RedisCancellationToken(job_id)
    reporter = TaskReporter(bus, cancellation)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            local_video_path = os.path.join(tmpdir, safe_filename)
            reporter.log("Downloading video from storage...")

            dl_ok = await storage_manager.copy_from(safe_filename, local_video_path)
            if not dl_ok:
                await bus.publish_async({"type": "finish", "success": False, "error": "Source video file is no longer available. It may have been deleted."})
                return

            items = await asyncio.to_thread(run_ocr_pipeline, local_video_path, config, reporter, cancellation)

            if cancellation.is_cancelled_sync():
                logging.info("OCR task %s cancelled by user.", job_id)
                await bus.publish_async({"type": "finish", "success": False, "error": "Task Cancelled"})
                return

            if items is not None:
                await bus.publish_async({"type": "finish", "success": True, "subtitles": items})
            else:
                raise RuntimeError("OCR pipeline execution failed.")
    except asyncio.CancelledError:
        logging.info("ARQ successfully aborted the main task wrapper for %s.", job_id)
        await bus.publish_async({"type": "finish", "success": False, "error": "Task Cancelled"})
    except TaskCancelledError:
        logging.info("OCR task %s cancelled by user.", job_id)
        await bus.publish_async({"type": "finish", "success": False, "error": "Task Cancelled"})
    except Exception as e:
        logging.error(f"Pipeline crashed: {e}")
        raise
    finally:
        await redis_conn.srem(f"pending_jobs:{safe_filename}", job_id)


async def render_blur_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    client_id = config["client_id"]
    job_id = ctx.get("job_id", "unknown")
    redis_conn: aioredis.Redis = ctx["redis"]
    loop = asyncio.get_running_loop()

    bus = RedisEventBus(redis_conn, client_id, job_id, loop)
    cancellation = RedisCancellationToken(job_id)
    reporter = TaskReporter(bus, cancellation)
    storage = StorageAdapter()

    task_config = RenderTaskConfig(**config)
    safe_filename = os.path.basename(task_config.filename)

    if not task_config.original_filename:
        raw = await redis_conn.get(f"original_name:{safe_filename}")
        if raw:
            task_config = task_config.model_copy(
                update={"original_filename": raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)}
            )

    try:
        output_filename = await render_blur_pipeline(task_config, storage, reporter, cancellation)

        await bus.publish_async(
            {
                "type": "finish",
                "success": True,
                "download_url": f"/api/video/download/{output_filename}",
                "download_filename": output_filename,
            }
        )
    except (asyncio.CancelledError, TaskCancelledError):
        logging.info("Render task %s cancelled by user.", job_id)
        await bus.publish_async({"type": "finish", "success": False, "error": "Task Cancelled"})
    finally:
        await redis_conn.srem(f"pending_jobs:{safe_filename}", job_id)


async def emotion_export_task(ctx: Dict[str, Any], config: Dict[str, Any]) -> None:
    from pathlib import Path

    from subvision.core.admin_config import record_emotion_job
    from subvision.core.export_names import export_stem, export_with_suffix
    from subvision.processing.emotion_export import run_emotion_export

    client_id = config["client_id"]
    filename = config["filename"]
    safe_filename = os.path.basename(filename)
    job_id = ctx.get("job_id", "unknown")
    redis_conn: aioredis.Redis = ctx["redis"]
    loop = asyncio.get_running_loop()

    bus = RedisEventBus(redis_conn, client_id, job_id, loop)
    cancellation = RedisCancellationToken(job_id)
    reporter = TaskReporter(bus, cancellation)

    try:
        from subvision.domain.emotion_models import EmotionAnalysisSettings

        original = config.get("original_filename")
        if not original:
            raw = await redis_conn.get(f"original_name:{safe_filename}")
            if raw:
                original = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)

        analysis = EmotionAnalysisSettings.model_validate(config.get("emotion_settings") or {})
        suffix = analysis.json_format.filename_suffix or "_emotion.json"
        if not suffix.endswith(".json"):
            suffix = "_emotion.json"
        stem = export_stem(original, safe_filename)
        out_name = export_with_suffix(stem, suffix)

        with tempfile.TemporaryDirectory() as tmpdir:
            local_video_path = os.path.join(tmpdir, safe_filename)
            reporter.log("Downloading video for emotion export...")
            dl_ok = await storage_manager.copy_from(safe_filename, local_video_path)
            if not dl_ok:
                await bus.publish_async(
                    {"type": "finish", "success": False, "error": "Video file not available."}
                )
                return

            local_json = os.path.join(tmpdir, out_name)
            subtitles = config.get("subtitles") or []
            reporter.set_total(len(subtitles))
            reporter.progress(0, max(len(subtitles), 1), "...")

            def progress_cb(current: int, total: int, eta: str) -> None:
                reporter.progress(current, total, eta)

            def cancel_check() -> bool:
                return cancellation.is_cancelled_sync()

            sync_redis = get_sync_redis()

            await asyncio.to_thread(
                run_emotion_export,
                local_video_path,
                subtitles,
                analysis,
                Path(local_json),
                filename=safe_filename,
                original_filename=config.get("original_filename") or safe_filename,
                progress_cb=progress_cb,
                cancel_check=cancel_check,
                redis_client=sync_redis,
                speaker_gender_overrides=config.get("speaker_gender_overrides"),
                speaker_profile_overrides=config.get("speaker_profile_overrides"),
            )

            if cancellation.is_cancelled_sync():
                await bus.publish_async({"type": "finish", "success": False, "error": "Task Cancelled"})
                return

            uploads_path = os.path.join(settings.cache_dir, out_name)
            os.makedirs(settings.cache_dir, exist_ok=True)
            shutil.copy2(local_json, uploads_path)

        download_url = f"/api/video/download/{out_name}"
        await bus.publish_async(
            {
                "type": "finish",
                "success": True,
                "download_url": download_url,
                "emotion_json": out_name,
            }
        )
        await record_emotion_job(
            redis_conn,
            {
                "job_id": job_id,
                "client_id": client_id,
                "filename": safe_filename,
                "output": out_name,
                "cues": len(subtitles),
            },
        )
    except (asyncio.CancelledError, TaskCancelledError):
        await bus.publish_async({"type": "finish", "success": False, "error": "Task Cancelled"})
    except Exception as exc:
        logging.error("Emotion export failed: %s", exc, exc_info=True)
        await bus.publish_async({"type": "finish", "success": False, "error": str(exc)})
        raise
    finally:
        await redis_conn.srem(f"pending_jobs:{safe_filename}", job_id)


async def startup(ctx: Dict[str, Any]) -> None:
    logging.info("Worker starting up...")
    logging.info("Pre-warming OCR engine...")
    try:
        engine = get_paddle_engine(lang="en", use_gpu=True)
        dummy_frame = np.zeros((100, 100, 3), dtype=np.uint8)
        engine.predict_batch([dummy_frame])
        logging.info("OCR engine pre-warmed successfully.")
    except Exception as e:
        logging.error(f"Failed to pre-warm OCR: {e}")

    if settings.emotion_export_enabled:
        try:
            from subvision.core.admin_config import env_emotion_defaults
            from subvision.processing.emotion_engine import warm_emotion_model

            emo_cfg = env_emotion_defaults().export
            if not emo_cfg.model_cache_dir:
                emo_cfg.model_cache_dir = settings.gigaam_model_cache_dir
            should_preload = emo_cfg.preload_model or settings.emotion_preload_model
            if should_preload and emo_cfg.analyze_emotion:
                ok, msg = await asyncio.to_thread(warm_emotion_model, emo_cfg)
                if ok:
                    logging.info("GigaAM emotion model pre-warmed: %s", msg)
                else:
                    logging.warning("GigaAM preload skipped: %s", msg)
        except Exception as e:
            logging.warning("Emotion model preload failed: %s", e)

async def shutdown(ctx: Dict[str, Any]) -> None:
    logging.info("Worker shutting down...")


async def on_job_end_handler(ctx: Dict[str, Any], job_id: str, result: Any, exc: Exception) -> None:
    redis_conn: aioredis.Redis = ctx["redis"]
    client_id = parse_client_id_from_job_id(job_id)

    if client_id != "unknown":
        try:
            await clear_active_job_if_match(redis_conn, client_id, job_id)
        except Exception as e:
            logging.error(f"Failed to clear active job for {client_id}: {e}")

    if exc is not None:
        is_cancelled = "cancel" in str(exc).lower() or isinstance(exc, (TaskCancelledError, asyncio.CancelledError))
        if is_cancelled:
            logging.info("Job %s cancelled.", job_id)
        else:
            logging.error("Job %s ended with exception: %s", job_id, exc)
        try:
            error_message = "Task Cancelled" if is_cancelled else f"Task Failed: {str(exc)}"

            bus = RedisEventBus(redis_conn, client_id, job_id, asyncio.get_event_loop())
            await bus.publish_async({"type": "finish", "success": False, "error": error_message})
        except Exception as e:
            logging.error(f"Failed to publish error state for {job_id}: {e}")


class WorkerSettings:
    functions = [process_ocr_task, render_blur_task, emotion_export_task]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    on_shutdown = shutdown
    after_job_ends = on_job_end_handler
    max_jobs = 1
    job_timeout = 86400
