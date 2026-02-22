"""
Router module handling OCR processing jobs, subtitle imports, and blur rendering.
"""
import os
import asyncio
import logging
import threading
from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import StreamingResponse
from io import BytesIO
import cv2

from api.schemas import ProcessConfig, RenderConfig, BlurPreviewConfig
from api.websockets.manager import connection_manager
from ocr.process_manager import ProcessManager
from media.blur_manager import BlurManager
from core.srt_parser import parse_srt

logger = logging.getLogger(__name__)

router = APIRouter()
process_mgr = ProcessManager()
UPLOAD_DIR = "uploads"

render_registry: dict[str, BlurManager] = {}
render_lock = threading.Lock()

@router.post("/start")
async def start_process(config: ProcessConfig):
    """
    Initiates a background OCR process for a specific video session.
    """
    safe_filename = os.path.basename(config.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    loop = asyncio.get_event_loop()

    def _emit(event_type: str, payload: dict) -> None:
        asyncio.run_coroutine_threadsafe(
            connection_manager.send_json(config.client_id, {"type": event_type, **payload}), loop
        )

    callbacks = {
        "log": lambda msg: _emit("log", {"message": msg}),
        "subtitle": lambda item: _emit("subtitle_new", {"item": item}),
        "ai_update": lambda item: _emit("subtitle_update", {"item": item}),
        "progress": lambda c, t, e: _emit("progress", {"current": c, "total": t, "eta": e}),
        "finish": lambda success: _emit("finish", {"success": success})
    }
    try:
        process_mgr.start_process(
            session_id=config.client_id,
            video_file=file_path,
            editor_data={"roi_override": config.roi},
            langs=config.languages,
            step=config.step,
            conf_threshold=config.conf_threshold,
            clahe_val=config.clahe_limit,
            scale_val=config.scale_factor,
            smart_skip=config.smart_skip,
            visual_cutoff=config.visual_cutoff,
            callbacks=callbacks
        )
        return {"status": "started", "job_id": config.client_id}
    except Exception as e:
        logger.error(f"Error starting process: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/stop/{client_id}")
async def stop_process(client_id: str):
    """
    Terminates active OCR or rendering tasks for a specific client session.
    """
    ocr_stopped = process_mgr.stop_process(client_id)

    render_stopped = False
    with render_lock:
        if client_id in render_registry:
            render_registry[client_id].stop()
            render_stopped = True

    return {"status": "stopped", "ocr_stopped": ocr_stopped, "render_stopped": render_stopped}

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
    Generates a preview frame demonstrating the requested blur configuration.
    """
    safe_filename = os.path.basename(config.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    blur_mgr = BlurManager()
    try:
        preview_image = blur_mgr.generate_preview(
            video_path=file_path,
            frame_index=config.frame_index,
            settings=config.blur_settings.dict(),
            text=config.subtitle_text
        )
        if preview_image is None:
            raise HTTPException(status_code=500, detail="Failed to generate preview")

        img_bgr = preview_image
        _, encoded_img = cv2.imencode('.jpg', img_bgr)
        return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

    except Exception as e:
        logger.error(f"Preview generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/render_blur")
async def render_blur_video(config: RenderConfig, background_tasks: BackgroundTasks):
    """
    Starts a background task to render the final blurred video.
    """
    safe_filename = os.path.basename(config.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found")

    output_filename = f"blurred_{safe_filename}"
    output_path = os.path.join(UPLOAD_DIR, output_filename)

    if os.path.exists(output_path):
        try:
            os.remove(output_path)
        except OSError:
            pass

    blur_mgr = BlurManager()
    with render_lock:
        render_registry[config.client_id] = blur_mgr

    loop = asyncio.get_event_loop()

    def progress_cb(current: int, total: int) -> None:
        if total <= 0:
            total = 1
        pct = min(100, int((current / total) * 100))
        eta_str = f"{pct}%"

        asyncio.run_coroutine_threadsafe(
            connection_manager.send_json(config.client_id, {
                "type": "progress",
                "current": current,
                "total": total,
                "eta": eta_str
            }),
            loop
        )

    def run_render_task() -> None:
        success = False
        error_msg = None
        try:
            blur_mgr.apply_blur_task(
                file_path,
                config.subtitles,
                config.blur_settings.dict(),
                output_path,
                progress_cb
            )
            success = True
        except InterruptedError:
            error_msg = "Stopped by user"
            success = False
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Render task failed: {e}", exc_info=True)
            success = False
        finally:
            with render_lock:
                if config.client_id in render_registry:
                    del render_registry[config.client_id]

            payload = {"type": "finish", "success": success}
            if success:
                payload["download_url"] = f"/uploads/{output_filename}"
            if error_msg:
                payload["error"] = error_msg

            asyncio.run_coroutine_threadsafe(
                connection_manager.send_json(config.client_id, payload),
                loop
            )

    background_tasks.add_task(run_render_task)

    return {"status": "rendering_started", "output": output_filename}
