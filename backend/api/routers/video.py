import os
import uuid
import logging
import cv2
import asyncio
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Form, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from io import BytesIO
from pydantic import BaseModel

from core.video_io import get_video_info, get_frame_image, generate_video_preview, get_video_dar
from api.schemas import VideoMetadata, PreviewConfig
from api.dependencies import get_video_path
from core.storage import storage_manager
from core.config import settings
from core.utils import validate_filename

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}

class UploadInitRequest(BaseModel):
    filename: str
    content_type: str
    total_chunks: int

class UploadCompleteRequest(BaseModel):
    filename: str
    upload_id: str
    total_chunks: int

_session_store: Dict[str, str] = {}

@router.get("/allowed-extensions")
async def get_allowed_extensions() -> List[str]:
    return list(ALLOWED_EXTENSIONS)

@router.post("/upload/init")
async def init_upload(req: UploadInitRequest) -> Dict[str, Any]:
    ext = os.path.splitext(req.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Extension not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    safe_filename = f"{uuid.uuid4().hex}{ext}"
    _session_store[safe_filename] = req.filename
    upload_id = await storage_manager.create_multipart_upload(safe_filename, req.content_type)
    if not upload_id:
        raise HTTPException(status_code=500, detail="Failed to initialize storage upload.")
    return {"upload_id": upload_id, "urls": [], "storage_filename": safe_filename}

@router.post("/upload/chunk")
async def upload_local_chunk(
    upload_id: str = Form(...),
    part_number: int = Form(...),
    file: UploadFile = File(...)
) -> Dict[str, Any]:
    data = await file.read()
    await storage_manager.save_local_chunk(upload_id, part_number, data)
    return {"status": "ok"}

@router.post("/upload/complete")
async def complete_upload(req: UploadCompleteRequest) -> VideoMetadata:
    safe_filename = req.filename
    original_name = _session_store.pop(safe_filename, safe_filename)

    success = await storage_manager.complete_local_upload(req.upload_id, safe_filename, req.total_chunks)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to complete storage upload.")

    video_path = get_video_path(safe_filename)
    frame, total_frames, corrected_width = await asyncio.to_thread(get_video_info, video_path)
    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid video format or unsupported codec."
        )
    height = frame.shape[0]
    cap = cv2.VideoCapture(video_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    duration = total_frames / fps
    cap.release()
    dar = await asyncio.to_thread(get_video_dar, video_path)
    if dar is None:
        dar = corrected_width / height
    return VideoMetadata(
        filename=safe_filename,
        original_filename=original_name,
        total_frames=total_frames,
        width=corrected_width,
        height=height,
        fps=fps,
        duration=duration,
        display_aspect_ratio=dar
    )

@router.delete("/delete/{filename}")
async def delete_video(filename: str):
    safe_filename = validate_filename(filename)
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
    return FileResponse(
        path=file_path,
        filename=safe_filename,
        media_type='video/mp4',
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'}
    )

@router.get("/frame/{filename}/{frame_index}")
async def get_frame(filename: str, frame_index: int):
    safe_filename = validate_filename(filename)
    video_path = get_video_path(safe_filename)
    image = await asyncio.to_thread(get_frame_image, video_path, frame_index)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")
    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    _, encoded_img = cv2.imencode('.jpg', image_bgr)
    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

@router.post("/preview")
async def get_preview(config: PreviewConfig):
    video_path = get_video_path(config.filename)
    preview_image = await asyncio.to_thread(
        generate_video_preview,
        video_path=video_path,
        frame_index=config.frame_index,
        roi_override=config.roi,
        scale_factor=config.scale_factor
    )
    if preview_image is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Processing failed")
    _, encoded_img = cv2.imencode('.jpg', preview_image)
    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")