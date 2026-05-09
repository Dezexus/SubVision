import logging
import uuid
import os
from fastapi import APIRouter, HTTPException, UploadFile, File, Request, BackgroundTasks
from fastapi.responses import StreamingResponse
from io import BytesIO
import cv2
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
        redis_conn = request.app.state.redis
        
        await redis_conn.sadd(f"pending_jobs:{safe_filename}", job_id)
        await redis_conn.set(f"active_job:{config.client_id}", job_id)
        
        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue OCR task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

async def _cancel_in_background(pool, redis_conn, job_id: str):
    """Execute cancellation logic reliably in the background."""
    try:
        await redis_conn.setex(f"job:{job_id}:cancel", 3600, "1")
        
        client_id = "unknown"
        if "_" in job_id:
            client_id = job_id.split("_", 1)[1].rsplit("_", 1)[0]
            
        if client_id != "unknown":
            await redis_conn.delete(f"active_job:{client_id}")
            
        job = Job(job_id, pool)
        await job.abort()
        logger.info(f"Background cancellation completed for {job_id}")
    except Exception as e:
        logger.error(f"Failed to background cancel job {job_id}: {e}")

@router.post("/stop")
async def stop_process(req: StopRequest, request: Request, background_tasks: BackgroundTasks):
    pool = request.app.state.arq_pool
    redis_conn = request.app.state.redis
    background_tasks.add_task(_cancel_in_background, pool, redis_conn, req.job_id)
    return {"status": "stopping", "job_id": req.job_id}

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
        redis_conn = request.app.state.redis
        
        await redis_conn.sadd(f"pending_jobs:{safe_filename}", job_id)
        await redis_conn.set(f"active_job:{config.client_id}", job_id)
        
        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue render task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))