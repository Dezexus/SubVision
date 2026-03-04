"""
Router module for handling stateless S3 direct video uploads and dynamic frame extraction.
"""
import os
import logging
import cv2
import asyncio
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import StreamingResponse, RedirectResponse, FileResponse
from io import BytesIO
from pydantic import BaseModel

from media.video.manager import VideoManager
from api.schemas import VideoMetadata, PreviewConfig
from api.dependencies import get_video_url
from core.storage import storage_manager
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}


class UploadInitRequest(BaseModel):
    """
    Schema for initializing a direct S3 multipart upload.
    """
    filename: str
    content_type: str
    total_chunks: int


class UploadPart(BaseModel):
    """
    Schema for a successfully uploaded S3 chunk.
    """
    PartNumber: int
    ETag: str


class UploadCompleteRequest(BaseModel):
    """
    Schema for finalizing an S3 multipart upload session.
    """
    filename: str
    upload_id: str
    parts: List[UploadPart]


@router.get("/allowed-extensions")
async def get_allowed_extensions() -> List[str]:
    """
    Returns a list of allowed video file extensions.
    """
    return list(ALLOWED_EXTENSIONS)


@router.post("/upload/init")
async def init_upload(req: UploadInitRequest) -> Dict[str, Any]:
    """
    Creates an S3 multipart upload session and issues presigned URLs for direct client uploads.
    """
    ext = os.path.splitext(req.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Extension not allowed. Supported: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    upload_id = await storage_manager.create_multipart_upload(req.filename, req.content_type)
    if not upload_id:
        raise HTTPException(status_code=500, detail="Failed to initialize storage upload.")

    presigned_urls = []
    if storage_manager.session:
        for i in range(1, req.total_chunks + 1):
            url = await storage_manager.get_presigned_upload_part(req.filename, upload_id, i)
            presigned_urls.append(url)

    return {"upload_id": upload_id, "urls": presigned_urls}


@router.post("/upload/complete")
async def complete_upload(req: UploadCompleteRequest) -> VideoMetadata:
    """
    Finalizes the S3 upload and retrieves video metadata dynamically using HTTP Range requests.
    """
    parts_dict = [{"PartNumber": p.PartNumber, "ETag": p.ETag} for p in req.parts]
    success = await storage_manager.complete_multipart_upload(req.filename, req.upload_id, parts_dict)

    if not success:
        raise HTTPException(status_code=500, detail="Failed to complete storage upload.")

    video_url = await get_video_url(req.filename)
    frame, total_frames = await asyncio.to_thread(VideoManager.get_video_info, video_url)

    if frame is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid video format or unsupported codec."
        )

    height, width, _ = frame.shape
    cap = cv2.VideoCapture(video_url)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    duration = total_frames / fps
    cap.release()

    return VideoMetadata(
        filename=req.filename,
        total_frames=total_frames,
        width=width,
        height=height,
        fps=fps,
        duration=duration
    )


@router.get("/download/{filename}")
async def download_file(filename: str):
    """
    Redirects the user to a secure Presigned URL for downloading.
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
async def get_frame(frame_index: int, video_url: str = Depends(get_video_url)):
    """
    Extracts a frame statelessly by reading the video stream via a Presigned S3 URL.
    """
    image = await asyncio.to_thread(VideoManager.get_frame_image, video_url, frame_index)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Frame not found")

    image_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    _, encoded_img = cv2.imencode('.jpg', image_bgr)

    return StreamingResponse(BytesIO(encoded_img.tobytes()), media_type="image/jpeg")


@router.post("/preview")
async def get_preview(config: PreviewConfig):
    """
    Generates a processed preview frame statelessly by reading the video stream via a Presigned S3 URL.
    """
    video_url = await get_video_url(config.filename)

    preview_image = await asyncio.to_thread(
        VideoManager.generate_preview,
        video_path=video_url,
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
