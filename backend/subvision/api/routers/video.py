import os
import uuid
import logging
import cv2
import asyncio
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Form, UploadFile, File, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse, FileResponse
from io import BytesIO
from pydantic import BaseModel, ValidationError
from subvision.core.video_io import get_video_info, get_frame_image, generate_video_preview, get_video_dar, get_video_metadata
from subvision.api.schemas import VideoMetadata, PreviewConfig
from subvision.api.dependencies import get_video_path
from subvision.api.websockets.manager import connection_manager
from subvision.core.storage import storage_manager
from subvision.core.config import settings
from subvision.core.utils import validate_filename
from subvision.core.constants import ALLOWED_VIDEO_EXTENSIONS
from arq.jobs import Job

logger = logging.getLogger(__name__)
router = APIRouter()


class UploadInitRequest(BaseModel):
    filename: str
    content_type: str
    total_chunks: int


class UploadCompleteRequest(BaseModel):
    filename: str
    upload_id: str
    total_chunks: int


@router.get("/config")
async def get_upload_config() -> Dict[str, Any]:
    return {"chunk_size": settings.upload_chunk_size, "max_size": settings.max_upload_size, "allowed_extensions": list(ALLOWED_VIDEO_EXTENSIONS)}


@router.get("/allowed-extensions")
async def get_allowed_extensions() -> List[str]:
    return list(ALLOWED_VIDEO_EXTENSIONS)


@router.post("/upload/init")
async def init_upload(req: UploadInitRequest, request: Request) -> Dict[str, Any]:
    ext = os.path.splitext(req.filename)[1].lower()
    if ext not in ALLOWED_VIDEO_EXTENSIONS:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=f"Extension not allowed. Supported: {', '.join(ALLOWED_VIDEO_EXTENSIONS)}")
    safe_filename = f"{uuid.uuid4().hex}{ext}"
    await request.app.state.redis.setex(f"session:{safe_filename}", 86400, req.filename)
    upload_id = safe_filename
    return {"upload_id": upload_id, "urls": [], "storage_filename": safe_filename}


@router.post("/upload/chunk")
async def upload_local_chunk(upload_id: str = Form(...), part_number: int = Form(...), file: UploadFile = File(...)) -> Dict[str, Any]:
    data = await file.read()
    offset = (part_number - 1) * settings.upload_chunk_size
    success = await storage_manager.save_chunk(upload_id, data, offset)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save chunk.")
    return {"status": "ok"}


@router.post("/upload/complete")
async def complete_upload(req: UploadCompleteRequest, request: Request) -> VideoMetadata:
    safe_filename = req.filename
    redis_conn = request.app.state.redis
    orig_bytes = await redis_conn.get(f"session:{safe_filename}")
    original_name = orig_bytes.decode("utf-8") if orig_bytes else safe_filename
    await redis_conn.delete(f"session:{safe_filename}")

    success = await storage_manager.complete_local_upload(safe_filename)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to complete storage upload.")

    video_path = get_video_path(safe_filename)
    info = await asyncio.to_thread(get_video_info, video_path)

    if info.frame is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid video format, corrupted file, or unsupported codec.")

    meta = await asyncio.to_thread(get_video_metadata, video_path)
    dar = await asyncio.to_thread(get_video_dar, video_path)

    height = info.frame.shape[0]
    if dar is None:
        dar = info.corrected_width / height

    fps = meta.get("fps", 25.0)
    duration = meta["total_frames"] / fps if fps > 0 else 0

    return VideoMetadata(
        filename=safe_filename, original_filename=original_name, total_frames=meta["total_frames"], width=info.corrected_width, height=height, fps=fps, duration=duration, display_aspect_ratio=dar
    )


@router.delete("/delete/{filename}")
async def delete_video(filename: str, request: Request):
    safe_filename = validate_filename(filename)
    redis_conn = request.app.state.redis
    pending_jobs_key = f"pending_jobs:{safe_filename}"
    job_ids = await redis_conn.smembers(pending_jobs_key)
    pool = request.app.state.arq_pool
    for jid_bytes in job_ids:
        jid = jid_bytes.decode() if isinstance(jid_bytes, bytes) else jid_bytes
        try:
            job = Job(jid, pool)
            await job.abort()
        except Exception as e:
            logger.warning(f"Could not abort job {jid}: {e}")
        try:
            await redis_conn.setex(f"job:{jid}:cancel", 3600, "1")
        except Exception:
            pass
    await redis_conn.delete(pending_jobs_key)

    success = await storage_manager.delete_file(safe_filename)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete file.")
    return {"status": "deleted"}


@router.get("/download/{filename}")
async def download_file(filename: str):
    safe_filename = validate_filename(filename)
    file_path = os.path.join(settings.cache_dir, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage.")
    return FileResponse(path=file_path, filename=safe_filename, media_type="video/mp4", headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'})


@router.get("/frame/{filename}/{frame_index}")
async def get_frame(filename: str, frame_index: int):
    safe_filename = validate_filename(filename)
    video_path = get_video_path(safe_filename)
    image = await asyncio.to_thread(get_frame_image, video_path, frame_index)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")
    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    _, encoded_img = cv2.imencode(".jpg", image_bgr)
    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")


@router.post("/preview")
async def get_preview(config: PreviewConfig):
    """Legacy HTTP preview endpoint."""
    video_path = get_video_path(config.filename)
    preview_image = await asyncio.to_thread(generate_video_preview, video_path=video_path, frame_index=config.frame_index, roi_override=config.roi, scale_factor=config.scale_factor)
    if preview_image is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Processing failed")
    _, encoded_img = cv2.imencode(".jpg", preview_image)
    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")


@router.websocket("/ws/stream/{client_id}")
async def preview_stream_endpoint(websocket: WebSocket, client_id: str):
    """Dedicated high-frequency WebSocket for binary streaming (previews)."""
    await connection_manager.connect_stream(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                config = PreviewConfig.model_validate_json(data)
                video_path = get_video_path(config.filename)
                preview_image = await asyncio.to_thread(generate_video_preview, video_path=video_path, frame_index=config.frame_index, roi_override=config.roi, scale_factor=config.scale_factor)
                if preview_image is not None:
                    _, encoded_img = cv2.imencode(".jpg", preview_image)
                    await connection_manager.send_bytes(client_id, encoded_img.tobytes())
            except ValidationError:
                pass
            except Exception as e:
                logger.warning(f"Preview stream error for {client_id}: {e}")
    except WebSocketDisconnect:
        pass
    finally:
        connection_manager.disconnect_stream(client_id, websocket)
