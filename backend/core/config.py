"""
Configuration module using pydantic-settings for type-safe environment variables.
"""
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings derived from environment variables or .env file.
    """
    allowed_origins: str = "http://localhost:7860,http://127.0.0.1:7860"

    s3_endpoint: Optional[str] = None
    s3_bucket: str = "subvision"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_region: str = "us-east-1"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
