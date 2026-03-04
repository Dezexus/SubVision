"""
Common dependencies and helper functions for FastAPI routers mapping storage locations.
"""
import os
from fastapi import HTTPException
from core.storage import storage_manager
from core.config import settings


async def get_video_url(filename: str) -> str:
    """
    Returns a direct S3 Presigned URL for stateless reading of frames via HTTP Range requests.
    Falls back to the local file path if S3 is not configured.
    """
    safe_filename = os.path.basename(filename)
    url = await storage_manager.get_presigned_url(safe_filename)

    if url:
        return url

    file_path = os.path.join(settings.cache_dir, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found.")

    return file_path


async def ensure_video_cached(filename: str) -> str:
    """
    Ensures the requested video file is present in the local cache.
    Temporarily retained for heavy worker tasks pending transition to TemporaryDirectory.
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(settings.cache_dir, safe_filename)

    if not os.path.exists(file_path):
        success = await storage_manager.download_file(safe_filename, file_path)
        if not success:
            raise HTTPException(status_code=404, detail="Video file not found in storage.")

    return file_path
