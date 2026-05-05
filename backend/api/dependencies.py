import os
from fastapi import HTTPException
from core.config import settings
from core.utils import validate_filename

def get_video_path(filename: str) -> str:
    safe_filename = validate_filename(filename)
    file_path = os.path.join(settings.cache_dir, safe_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Video file not found in local storage.")
    return file_path