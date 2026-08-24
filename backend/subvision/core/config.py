import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from subvision.core.constants import DEFAULT_CHUNK_SIZE, MAX_UPLOAD_SIZE


class Settings(BaseSettings):
    """Application configuration settings."""

    allowed_origins: str = "http://localhost:7860,http://127.0.0.1:7860"
    cache_dir: str = "uploads"
    redis_url: str = "redis://redis:6379/0"
    log_level: str = "INFO"

    upload_chunk_size: int = DEFAULT_CHUNK_SIZE
    max_upload_size: int = MAX_UPLOAD_SIZE
    frame_cache_size: int = 50
    blur_cache_size: int = 30

    paddle_gpu_memory_fraction: float = 0.35
    use_nvdec: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
os.makedirs(settings.cache_dir, exist_ok=True)

# Paddle reads this env var at import time in the worker process.
os.environ.setdefault(
    "FLAGS_fraction_of_gpu_memory_to_use",
    str(settings.paddle_gpu_memory_fraction),
)
