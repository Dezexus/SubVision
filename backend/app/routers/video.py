import os
import shutil
import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, HTTPException, File
from fastapi.responses import StreamingResponse, JSONResponse
from io import BytesIO

from services.video_manager import VideoManager
from app.schemas import VideoMetadata, PreviewConfig

router = APIRouter()
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload", response_model=VideoMetadata)
async def upload_video(file: UploadFile = File(...)):
    """Handles video upload and returns metadata."""
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    frame, total_frames = VideoManager.get_video_info(file_path)

    if frame is None:
        os.remove(file_path)
        raise HTTPException(status_code=400, detail="Invalid video format")

    height, width, _ = frame.shape

    # Simple estimation, normally retrieved from metadata
    cap = cv2.VideoCapture(file_path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    duration = total_frames / fps
    cap.release()

    return VideoMetadata(
        filename=file.filename,
        total_frames=total_frames,
        width=width,
        height=height,
        fps=fps,
        duration=duration
    )

@router.get("/frame/{filename}/{frame_index}")
async def get_frame(filename: str, frame_index: int):
    """Retrieves a specific raw frame as a JPEG image."""
    file_path = os.path.join(UPLOAD_DIR, filename)
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
    """Generates a processed preview frame based on settings."""
    file_path = os.path.join(UPLOAD_DIR, config.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Mocking editor_data structure for compatibility or modify VideoManager to accept ROI list
    # Assuming VideoManager refactor:
    # preview = VideoManager.generate_preview_direct(..., roi=config.roi, ...)

    # Adapting to current structure:
    # ROI format expected by logic: [x, y, w, h]
    # Current VideoManager expects 'editor_data' dict for Gradio.
    # Logic needs to be adapted in VideoManager, but here is the interface:

    preview_image = VideoManager.generate_preview(
        video_path=file_path,
        frame_index=config.frame_index,
        editor_data={"layers": [], "roi_override": config.roi}, # ROI override logic needed in service
        clahe_val=config.clahe_limit,
        scale_factor=config.scale_factor
    )

    if preview_image is None:
        raise HTTPException(status_code=500, detail="Processing failed")

    img_byte_arr = BytesIO()
    preview_image.save(img_byte_arr, format='JPEG')
    img_byte_arr.seek(0)

    return StreamingResponse(img_byte_arr, media_type="image/jpeg")
