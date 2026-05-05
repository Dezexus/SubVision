import os
import logging
import uuid
import shutil
import asyncio
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)

class StorageManager:
    def __init__(self) -> None:
        pass

    def _resolve_path(self, filename: str) -> str:
        return os.path.join(settings.cache_dir, filename)

    def init_local_upload(self, upload_id: str) -> None:
        temp_dir = os.path.join(settings.cache_dir, ".temp", upload_id)
        os.makedirs(temp_dir, exist_ok=True)

    async def save_local_chunk(self, upload_id: str, part_number: int, data: bytes) -> None:
        chunk_path = os.path.join(settings.cache_dir, ".temp", upload_id, f"{part_number}.chunk")
        def _write():
            with open(chunk_path, "wb") as f:
                f.write(data)
        await asyncio.to_thread(_write)

    async def complete_local_upload(self, upload_id: str, filename: str, total_chunks: int) -> bool:
        temp_dir = os.path.join(settings.cache_dir, ".temp", upload_id)
        final_path = self._resolve_path(filename)

        def _assemble():
            for i in range(1, total_chunks + 1):
                chunk_path = os.path.join(temp_dir, f"{i}.chunk")
                if not os.path.exists(chunk_path):
                    raise FileNotFoundError(f"Missing chunk {i}")
            with open(final_path, "wb") as final_file:
                for i in range(1, total_chunks + 1):
                    chunk_path = os.path.join(temp_dir, f"{i}.chunk")
                    with open(chunk_path, "rb") as chunk_file:
                        final_file.write(chunk_file.read())
                    os.remove(chunk_path)
            os.rmdir(temp_dir)

        try:
            await asyncio.to_thread(_assemble)
            return True
        except Exception as e:
            logger.error(f"Local assembly failed: {e}")
            try:
                for i in range(1, total_chunks + 1):
                    chunk = os.path.join(temp_dir, f"{i}.chunk")
                    if os.path.exists(chunk):
                        os.remove(chunk)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
            except Exception as cleanup_err:
                logger.error(f"Cleanup after assembly error failed: {cleanup_err}")
            return False

    async def create_multipart_upload(self, s3_key: str, content_type: str) -> Optional[str]:
        upload_id = str(uuid.uuid4())
        self.init_local_upload(upload_id)
        return upload_id

    async def upload_file(self, local_path: str, key: str) -> bool:
        try:
            target_path = self._resolve_path(key)
            await asyncio.to_thread(shutil.copy2, local_path, target_path)
            return True
        except Exception as e:
            logger.error(f"Local upload failed: {e}")
            return False

    async def download_file(self, key: str, local_path: str) -> bool:
        source_path = self._resolve_path(key)
        if not os.path.exists(source_path):
            return False
        try:
            await asyncio.to_thread(shutil.copy2, source_path, local_path)
            return True
        except Exception as e:
            logger.error(f"Local download failed: {e}")
            return False

    async def delete_file(self, key: str) -> bool:
        target_path = self._resolve_path(key)
        if os.path.exists(target_path):
            try:
                os.remove(target_path)
                return True
            except Exception as e:
                logger.error(f"Local file deletion failed: {e}")
                return False
        return True

storage_manager = StorageManager()