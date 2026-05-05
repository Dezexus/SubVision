import logging
import uuid
import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from io import BytesIO
import cv2
import redis.asyncio as aioredis
from arq.jobs import Job
from pydantic import BaseModel

from api.schemas import ProcessConfig, RenderConfig, BlurPreviewConfig, BlurSettings
from api.dependencies import get_video_path
from rendering.blur_preview import generate_blur_preview
from processing.subtitle_parser import parse_srt
from processing.presets import get_all_presets, get_supported_languages
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

class StopRequest(BaseModel):
    job_id: str

@router.get("/presets")
async def get_presets():
    return get_all_presets()

@router.get("/languages")
async def get_languages():
    return get_supported_languages()

@router.get("/blur-defaults")
async def get_blur_defaults():
    return BlurSettings().model_dump()

@router.get("/process-defaults")
async def get_process_defaults():
    dummy = ProcessConfig(filename="", client_id="", roi=[0,0,0,0])
    return dummy.model_dump(exclude={"filename", "client_id", "roi"})

@router.post("/start")
async def start_process(config: ProcessConfig, request: Request):
    try:
        pool = request.app.state.arq_pool
        job_id = f"ocr_{config.client_id}_{uuid.uuid4().hex[:8]}"
        await pool.enqueue_job("process_ocr_task", config.model_dump(), _job_id=job_id)
        safe_filename = os.path.basename(config.filename)
        redis_conn = await aioredis.from_url(settings.redis_url)
        await redis_conn.sadd(f"pending_jobs:{safe_filename}", job_id)
        await redis_conn.aclose()
        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue OCR task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop")
async def stop_process(req: StopRequest, request: Request):
    pool = request.app.state.arq_pool
    job = Job(req.job_id, pool)
    try:
        stopped = await job.abort()
    except Exception as e:
        logger.warning(f"Abort attempt failed: {e}")
        stopped = False

    try:
        redis_conn = await aioredis.from_url(settings.redis_url)
        await redis_conn.setex(f"job:{req.job_id}:cancel", 3600, "1")
        await redis_conn.aclose()
    except Exception as e:
        logger.warning(f"Could not set cancel flag in Redis: {e}")

    return {"status": "stopped", "job_id": req.job_id, "success": stopped}

@router.post("/import_srt")
async def import_srt(file: UploadFile = File(...)):
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
    video_path = get_video_path(config.filename)

    try:
        preview_image = generate_blur_preview(
            video_path=video_path,
            frame_index=config.frame_index,
            settings=config.blur_settings.model_dump(),
            text=config.subtitle_text
        )
        if preview_image is None:
            raise HTTPException(status_code=500, detail="Failed to generate preview")

        _, encoded_img = cv2.imencode('.jpg', preview_image)
        return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Preview generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/render_blur")
async def render_blur_video(config: RenderConfig, request: Request):
    try:
        pool = request.app.state.arq_pool
        job_id = f"blur_{config.client_id}_{uuid.uuid4().hex[:8]}"
        await pool.enqueue_job("render_blur_task", config.model_dump(), _job_id=job_id)
        safe_filename = os.path.basename(config.filename)
        redis_conn = await aioredis.from_url(settings.redis_url)
        await redis_conn.sadd(f"pending_jobs:{safe_filename}", job_id)
        await redis_conn.aclose()
        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue render task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))