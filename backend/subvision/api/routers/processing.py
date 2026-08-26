import logging
import uuid
import os
import json
import asyncio
from fastapi import APIRouter, HTTPException, UploadFile, File, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from io import BytesIO
import cv2
from pydantic import BaseModel

from subvision.api.schemas import ProcessConfig, RenderConfig, BlurPreviewConfig, BlurSettings
from subvision.api.dependencies import get_video_path
from subvision.core.jobs import cancel_job, set_active_job
from subvision.rendering.blur_preview import generate_blur_preview
from subvision.processing.subtitle_parser import parse_srt
from subvision.processing.presets import get_all_presets, get_supported_languages, get_preset_config

logger = logging.getLogger(__name__)
router = APIRouter()


async def _register_active_job(redis_conn, pool, client_id: str, job_id: str, filename: str) -> None:
    """Mark job active, store meta, cancel any previous active job for this client."""
    safe_filename = os.path.basename(filename)
    await redis_conn.sadd(f"pending_jobs:{safe_filename}", job_id)
    previous = await set_active_job(redis_conn, client_id, job_id, safe_filename)
    seed = json.dumps(
        {"type": "progress", "current": 0, "total": 0, "eta": "...", "job_id": job_id},
        default=str,
    )
    await redis_conn.setex(f"job_status:{job_id}", 86400, seed)
    if previous:
        logger.info("Replacing active job %s with %s for client %s", previous, job_id, client_id)
        await cancel_job(pool, redis_conn, previous, client_id)


class StopRequest(BaseModel):
    """Model for stop request."""

    job_id: str


@router.get("/presets")
async def get_presets():
    """Get all presets."""
    return get_all_presets()


@router.get("/languages")
async def get_languages():
    """Get all languages."""
    return get_supported_languages()


@router.get("/blur-defaults")
async def get_blur_defaults():
    """Get default blur settings."""
    return BlurSettings().model_dump()


@router.get("/process-defaults")
async def get_process_defaults():
    """Get default process configuration."""
    config = get_preset_config("⚖️ Balance")
    return {
        **config,
        "preset": "⚖️ Balance",
        "languages": "en",
        "conf_threshold": config["min_conf"],
    }


@router.post("/start")
async def start_process(config: ProcessConfig, request: Request):
    """Start OCR process."""
    try:
        pool = request.app.state.arq_pool
        job_id = f"ocr_{config.client_id}_{uuid.uuid4().hex[:8]}"
        await pool.enqueue_job("process_ocr_task", config.model_dump(), _job_id=job_id)

        redis_conn = request.app.state.redis
        await _register_active_job(redis_conn, pool, config.client_id, job_id, config.filename)

        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _cancel_in_background(pool, redis_conn, job_id: str):
    """Cancel job safely in background."""
    await cancel_job(pool, redis_conn, job_id)


@router.post("/stop")
async def stop_process(req: StopRequest, request: Request, background_tasks: BackgroundTasks):
    """Stop processing job."""
    pool = request.app.state.arq_pool
    redis_conn = request.app.state.redis
    background_tasks.add_task(_cancel_in_background, pool, redis_conn, req.job_id)
    return {"status": "stopping", "job_id": req.job_id}


@router.post("/import_srt")
async def import_srt(file: UploadFile = File(...)):
    """Import subtitles from file."""
    try:
        content = await file.read()
        content_str = content.decode("utf-8")
        subtitles = parse_srt(content_str)
        return subtitles
    except UnicodeDecodeError:
        try:
            content_str = content.decode("cp1252")
            subtitles = parse_srt(content_str)
            return subtitles
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid file encoding")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse SRT: {str(e)}")


@router.post("/preview_blur")
async def preview_blur_frame(config: BlurPreviewConfig):
    """Preview blur effect."""
    video_path = get_video_path(config.filename)

    try:
        preview_image = await asyncio.to_thread(
            generate_blur_preview,
            video_path=video_path,
            frame_index=config.frame_index,
            settings=config.blur_settings.model_dump(),
            text=config.subtitle_text,
            subtitle_texts=config.subtitle_texts or None,
        )
        if preview_image is None:
            raise HTTPException(status_code=500, detail="Failed to generate preview")

        _, encoded_img = cv2.imencode(".jpg", preview_image)
        return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Preview generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/render_blur")
async def render_blur_video(config: RenderConfig, request: Request):
    """Start render blur process."""
    try:
        pool = request.app.state.arq_pool
        job_id = f"blur_{config.client_id}_{uuid.uuid4().hex[:8]}"
        await pool.enqueue_job("render_blur_task", config.model_dump(), _job_id=job_id)

        redis_conn = request.app.state.redis
        await _register_active_job(redis_conn, pool, config.client_id, job_id, config.filename)

        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue render task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
