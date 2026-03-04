"""
Common dependencies and helper functions strictly enforcing storage operational modes.
"""
import os
from fastapi import HTTPException
from core.storage import storage_manager
from core.config import settings


async def get_video_url(filename: str) -> str:
    """
    Resolves the video location returning either a presigned S3 URL or a local file path based on strict mode.
    """
    safe_filename = os.path.basename(filename)

    if settings.storage_mode == "s3":
        url = await storage_manager.get_presigned_url(safe_filename)
        if not url:
            raise HTTPException(status_code=404, detail="Video file URL could not be generated from S3.")
        return url

    file_path = os.path.join(settings.cache_dir, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found in local storage.")

    return file_path
