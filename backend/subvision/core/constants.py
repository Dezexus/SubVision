DEFAULT_CHUNK_SIZE: int = 10 * 1024 * 1024
MAX_UPLOAD_SIZE: int = 4 * 1024 * 1024 * 1024

MOTION_BLUR_KSIZE: tuple[int, int] = (3, 3)
MOTION_MSE_THRESH: float = 15.0

SUBTITLE_SIMILARITY_THRESH: float = 0.6

ALLOWED_VIDEO_EXTENSIONS: set[str] = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
