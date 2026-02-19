"""
API router for video management with chunked upload and strict validation.
"""
import os
import uuid
import cv2
from typing import Union
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import StreamingResponse, FileResponse
from io import BytesIO

from services.video_manager import VideoManager
from app.schemas import VideoMetadata, PreviewConfig

router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}

@router.post("/upload")
async def upload_video(
    file: UploadFile = File(...),
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    total_chunks: int = Form(...),
    filename: str = Form(...)
) -> Union[VideoMetadata, dict]:
    """Handles chunked video uploads with strict validation."""
    ext = os.path.splitext(filename)[1].lower()

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Extension not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    temp_path = os.path.join(UPLOAD_DIR, f"{upload_id}.part")

    try:
        with open(temp_path, "ab") as buffer:
            buffer.write(await file.read())
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save chunk: {e}")

    if chunk_index == total_chunks - 1:
        final_filename = f"{upload_id}{ext}"
        final_path = os.path.join(UPLOAD_DIR, final_filename)
        os.rename(temp_path, final_path)

        frame, total_frames = VideoManager.get_video_info(final_path)

        if frame is None:
            if os.path.exists(final_path):
                os.remove(final_path)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid video format or corrupted file."
            )

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
    """Provides a download stream for the requested video file."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=safe_filename,
        media_type='application/octet-stream'
    )

@router.get("/frame/{filename}/{frame_index}")
async def get_frame(filename: str, frame_index: int):
    """Extracts and returns a specific video frame as a JPEG image."""
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    image = VideoManager.get_frame_image(file_path, frame_index)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")

    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    _, encoded_img = cv2.imencode('.jpg', image_bgr)

    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

@router.post("/preview")
async def get_preview(config: PreviewConfig):
    """Generates and returns a processed preview frame based on configuration."""
    safe_filename = os.path.basename(config.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")

    preview_image = VideoManager.generate_preview(
        video_path=file_path,
        frame_index=config.frame_index,
        editor_data={"layers": [], "roi_override": config.roi},
        scale_factor=config.scale_factor
    )

    if preview_image is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Processing failed")

    img_byte_arr = BytesIO()
    preview_image.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)

    return StreamingResponse(img_byte_arr, media_type="image/jpeg")
