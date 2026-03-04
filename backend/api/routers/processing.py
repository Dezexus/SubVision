"""
Router module handling API requests by delegating tasks to the ARQ message broker.
"""
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from io import BytesIO
import cv2
from arq.jobs import Job

from api.schemas import ProcessConfig, RenderConfig, BlurPreviewConfig, BlurSettings
from api.dependencies import get_video_url
from media.blur_manager import BlurManager
from core.srt_parser import parse_srt
from core.presets import get_all_presets, get_supported_languages

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/presets")
async def get_presets():
    """
    Returns a list of all available OCR processing presets.
    """
    return get_all_presets()


@router.get("/languages")
async def get_languages():
    """
    Returns a list of all supported OCR languages.
    """
    return get_supported_languages()


@router.get("/blur-defaults")
async def get_blur_defaults():
    """
    Returns the default configuration values for blur settings.
    """
    return BlurSettings().model_dump()


@router.get("/process-defaults")
async def get_process_defaults():
    """
    Returns the default configuration values for process settings.
    """
    dummy = ProcessConfig(filename="", client_id="", roi=[0,0,0,0])
    return dummy.model_dump(exclude={"filename", "client_id", "roi"})


@router.post("/start")
async def start_process(config: ProcessConfig, request: Request):
    """
    Enqueues an OCR processing task to the ARQ message broker.
    """
    try:
        pool = request.app.state.arq_pool
        job_id = f"ocr_{config.client_id}"
        await pool.enqueue_job("process_ocr_task", config.model_dump(), _job_id=job_id)
        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue OCR task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stop/{client_id}")
async def stop_process(client_id: str, request: Request):
    """
    Revokes active or pending tasks for a specific client session via ARQ.
    """
    pool = request.app.state.arq_pool
    ocr_job = Job(f"ocr_{client_id}", pool)
    blur_job = Job(f"blur_{client_id}", pool)

    ocr_stopped = await ocr_job.abort()
    blur_stopped = await blur_job.abort()

    return {"status": "stopped", "ocr_stopped": ocr_stopped, "render_stopped": blur_stopped}


@router.post("/import_srt")
async def import_srt(file: UploadFile = File(...)):
    """
    Parses an uploaded SRT file and returns subtitle objects.
    """
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
    """
    Generates a preview frame fetching the source video stream statelessly via S3 URL.
    """
    video_url = await get_video_url(config.filename)

    try:
        preview_image = BlurManager.generate_preview(
            video_path=video_url,
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
    """
    Enqueues a video rendering and blurring task to the ARQ message broker.
    """
    try:
        pool = request.app.state.arq_pool
        job_id = f"blur_{config.client_id}"
        await pool.enqueue_job("render_blur_task", config.model_dump(), _job_id=job_id)
        return {"status": "queued", "job_id": job_id}
    except Exception as e:
        logger.error(f"Failed to enqueue render task: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
