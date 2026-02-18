"""
This module provides API endpoints for video file management, including
uploading, downloading, frame extraction, and preview generation.
"""
import os
import shutil
import uuid
import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, HTTPException, File, BackgroundTasks
from fastapi.responses import StreamingResponse, FileResponse
from io import BytesIO

from services.video_manager import VideoManager
from services.cleanup import cleanup_old_files
from app.schemas import VideoMetadata, PreviewConfig

router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=VideoMetadata)
async def upload_video(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Handles video upload, saves it with a secure name, extracts metadata,
    and schedules a background task to clean up old files.
    """
    background_tasks.add_task(cleanup_old_files, max_age_hours=12)

    filename, ext = os.path.splitext(file.filename)
    if not ext:
        ext = ".mp4"

    safe_filename = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

    frame, total_frames = VideoManager.get_video_info(file_path)

    if frame is None:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail="Invalid video format or codec. Please use standard MP4/MKV/AVI.")

    height, width, _ = frame.shape

    cap = cv2.VideoCapture(file_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    duration = total_frames / fps
    cap.release()

    return VideoMetadata(
        filename=safe_filename,
        total_frames=total_frames,
        width=width,
        height=height,
        fps=fps,
        duration=duration
    )

@router.get("/download/{filename}")
async def download_file(filename: str):
    """
    Provides a download link for the specified raw video file.
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=file_path,
        filename=safe_filename,
        media_type='application/octet-stream'
    )

@router.get("/frame/{filename}/{frame_index}")
async def get_frame(filename: str, frame_index: int):
    """
    Retrieves a specific raw frame from the video and returns it as a JPEG image.
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    image = VideoManager.get_frame_image(file_path, frame_index)
    if image is None:
        raise HTTPException(status_code=404, detail="Frame not found")

    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    _, encoded_img = cv2.imencode('.jpg', image_bgr)
    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")

@router.post("/preview")
async def get_preview(config: PreviewConfig):
    """
    Generates a processed preview frame based on client-side settings
    (e.g., scale, ROI) and returns it as a JPEG image.
    """
    safe_filename = os.path.basename(config.filename)
    file_path = os.path.join(UPLOAD_DIR, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    preview_image = VideoManager.generate_preview(
        video_path=file_path,
        frame_index=config.frame_index,
        editor_data={"layers": [], "roi_override": config.roi},
        scale_factor=config.scale_factor
    )

    if preview_image is None:
        raise HTTPException(status_code=500, detail="Processing failed")

    img_byte_arr = BytesIO()
    preview_image.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)

    return StreamingResponse(img_byte_arr, media_type="image/jpeg")
