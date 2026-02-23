"""
Router module for handling video uploads, frame extraction, and preview generation using S3 storage.
"""
import os
import re
import logging
import cv2
import asyncio
from typing import Union, List, Dict
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from fastapi.responses import StreamingResponse, RedirectResponse, FileResponse
from io import BytesIO

from media.video.manager import VideoManager
from media.video.upload import UploadManager
from api.schemas import VideoMetadata, PreviewConfig
from api.websockets.manager import connection_manager
from api.dependencies import ensure_video_cached
from core.storage import storage_manager
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

upload_manager = UploadManager(settings.cache_dir)
ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}

@router.get("/allowed-extensions")
async def get_allowed_extensions() -> List[str]:
    """
    Returns a list of allowed video file extensions.
    """
    return list(ALLOWED_EXTENSIONS)

@router.get("/upload/status/{upload_id}")
async def get_upload_status(upload_id: str, total_chunks: int) -> Dict[str, List[int]]:
    """
    Returns a list of missing chunk indices for a specific upload session to support resuming.
    """
    if not re.match(r"^[a-zA-Z0-9\-]+$", upload_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid upload_id format."
        )
    missing = upload_manager.get_missing_chunks(upload_id, total_chunks)
    return {"missing_chunks": missing}

@router.post("/upload")
async def upload_video(
        file: UploadFile = File(...),
        upload_id: str = Form(...),
        chunk_index: int = Form(...),
        total_chunks: int = Form(...),
        filename: str = Form(...),
        client_id: str = Form(None)
) -> Union[VideoMetadata, dict]:
    """
    Handles reliable chunked video uploads and synchronization with S3 storage.
    """
    if not re.match(r"^[a-zA-Z0-9\-]+$", upload_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid upload_id format."
        )

    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Extension not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    try:
        chunk_data = await file.read()
        await asyncio.to_thread(upload_manager.save_chunk, upload_id, chunk_index, chunk_data)
    except Exception as e:
        logger.error(f"Failed to save chunk {chunk_index} for {upload_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save chunk.")

    if upload_manager.is_upload_complete(upload_id, total_chunks):
        final_filename = f"{upload_id}{ext}"

        try:
            final_path = await asyncio.to_thread(upload_manager.assemble_file, upload_id, total_chunks, final_filename)
        except Exception as e:
            logger.error(f"Failed to assemble file {final_filename}: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="File assembly failed.")

        frame, total_frames = await asyncio.to_thread(VideoManager.get_video_info, final_path)

        if frame is None:
            logger.warning(f"OpenCV failed to decode {final_filename}. Attempting H.264 fallback.")
            if client_id:
                await connection_manager.send_json(client_id, {"type": "log", "message": "CONVERTING_CODEC"})

            converted_path = await VideoManager.convert_video_to_h264(final_path)
            if converted_path and os.path.exists(converted_path):
                os.remove(final_path)
                final_path = converted_path
                final_filename = os.path.basename(final_path)
                frame, total_frames = await asyncio.to_thread(VideoManager.get_video_info, final_path)

        if frame is None:
            if os.path.exists(final_path):
                os.remove(final_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid video format or unsupported codec."
            )

        upload_success = await storage_manager.upload_file(final_path, final_filename)
        if not upload_success:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 upload failed.")

        height, width, _ = frame.shape
        cap = cv2.VideoCapture(final_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        duration = total_frames / fps
        cap.release()

        return VideoMetadata(
            filename=final_filename,
            total_frames=total_frames,
            width=width,
            height=height,
            fps=fps,
            duration=duration
        )

    return {"status": "chunk_received", "chunk": chunk_index}

@router.get("/download/{filename}")
async def download_file(filename: str):
    """
    Redirects the user to a secure Presigned URL or serves the file locally if S3 is disabled.
    """
    safe_filename = os.path.basename(filename)

    url = await storage_manager.get_presigned_url(safe_filename)
    if url:
        return RedirectResponse(url=url)

    file_path = os.path.join(settings.cache_dir, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found in storage.")

    return FileResponse(
        path=file_path,
        filename=safe_filename,
        media_type='application/octet-stream'
    )

@router.get("/frame/{filename}/{frame_index}")
async def get_frame(frame_index: int, file_path: str = Depends(ensure_video_cached)):
    """
    Extracts a frame, fetching the video from S3 into local cache if necessary.
    """
    image = await asyncio.to_thread(VideoManager.get_frame_image, file_path, frame_index)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")

    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    _, encoded_img = cv2.imencode('.jpg', image_bgr)

    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

@router.post("/preview")
async def get_preview(config: PreviewConfig):
    """
    Generates a processed preview frame, fetching the video from S3 into local cache if necessary.
    """
    file_path = await ensure_video_cached(config.filename)

    preview_image = await asyncio.to_thread(
        VideoManager.generate_preview,
        video_path=file_path,
        frame_index=config.frame_index,
        editor_data={"roi_override": config.roi},
        scale_factor=config.scale_factor
    )

    if preview_image is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Processing failed")

    img_byte_arr = BytesIO()
    preview_image.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)

    return StreamingResponse(img_byte_arr, media_type="image/jpeg")
