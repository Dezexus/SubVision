import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    allowed_origins: str = "http://localhost:7860,http://127.0.0.1:7860"
    cache_dir: str = "uploads"
    redis_url: str = "redis://redis:6379/0"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
os.makedirs(settings.cache_dir, exist_ok=True)