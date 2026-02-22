"""
Common dependencies and helper functions for FastAPI routers.
"""
import os
from fastapi import HTTPException
from core.storage import storage_manager

CACHE_DIR = "cache"
os.makedirs(CACHE_DIR, exist_ok=True)

async def ensure_video_cached(filename: str) -> str:
    """
    Ensures the requested video file is present in the local cache,
    fetching it from S3 if necessary. Returns the local file path.
    """
    safe_filename = os.path.basename(filename)
    file_path = os.path.join(CACHE_DIR, safe_filename)

    if not os.path.exists(file_path):
        success = await storage_manager.download_file(safe_filename, file_path)
        if not success:
            raise HTTPException(status_code=404, detail="Video file not found in storage.")

    return file_path
