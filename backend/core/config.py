"""
Configuration module defining explicit application modes and environment variables.
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings enforcing strict operational modes for storage and infrastructure.
    """
    allowed_origins: str = "http://localhost:7860,http://127.0.0.1:7860"

    storage_mode: str = "local" # local or s3

    s3_endpoint: Optional[str] = None
    s3_bucket: str = "subvision"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"

    cache_dir: str = "uploads"
    redis_url: str = "redis://redis:6379/0"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
os.makedirs(settings.cache_dir, exist_ok=True)
