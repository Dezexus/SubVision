import os
import shutil
import logging
import asyncio
from typing import Dict

class StorageManager:
    """Storage manager with concurrent chunk upload protection."""
    def __init__(self, upload_dir: str = "uploads") -> None:
        self.upload_dir = upload_dir
        self.temp_dir = os.path.join(upload_dir, ".temp")
        self._locks: Dict[str, asyncio.Lock] = {}
        os.makedirs(self.upload_dir, exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)

    def _get_lock(self, filename: str) -> asyncio.Lock:
        if filename not in self._locks:
            self._locks[filename] = asyncio.Lock()
        return self._locks[filename]

    async def save_chunk(self, filename: str, chunk_data: bytes, offset: int) -> bool:
        """Save uploaded chunk bytes to local storage sequentially."""
        if offset < 0 or not chunk_data:
            logging.error(f"Invalid chunk payload or offset {offset} for {filename}")
            return False

        temp_path = os.path.join(self.temp_dir, filename)

        def _write_chunk() -> bool:
            if offset > 0 and not os.path.exists(temp_path):
                logging.error(f"Cannot write offset {offset} to non-existent file {filename}")
                return False
            mode = "r+b" if os.path.exists(temp_path) else "w+b"
            with open(temp_path, mode) as f:
                f.seek(offset)
                f.write(chunk_data)
            return True

        lock = self._get_lock(filename)
        async with lock:
            try:
                return await asyncio.to_thread(_write_chunk)
            except Exception as e:
                logging.error(f"Failed to write chunk for {filename} at offset {offset}: {e}")
                return False

    async def complete_local_upload(self, filename: str) -> bool:
        """Complete upload and move file to main directory."""
        temp_path = os.path.join(self.temp_dir, filename)
        final_path = os.path.join(self.upload_dir, filename)

        lock = self._get_lock(filename)
        async with lock:
            if not os.path.exists(temp_path):
                logging.error(f"Temp file missing for completion: {filename}")
                return False
            try:
                await asyncio.to_thread(shutil.move, temp_path, final_path)
                return True
            except Exception as e:
                logging.error(f"Failed to finalize upload for {filename}: {e}")
                return False
            finally:
                self._locks.pop(filename, None)

    async def download_file(self, key: str, dest: str) -> bool:
        """Copy file to destination."""
        src = os.path.join(self.upload_dir, key)
        if not os.path.exists(src):
            return False
        try:
            await asyncio.to_thread(shutil.copy2, src, dest)
            return True
        except Exception as e:
            logging.error(f"Failed to download {key} to {dest}: {e}")
            return False

    async def upload_file(self, src: str, key: str) -> bool:
        """Copy file to uploads directory."""
        dest = os.path.join(self.upload_dir, key)
        try:
            await asyncio.to_thread(shutil.copy2, src, dest)
            return True
        except Exception as e:
            logging.error(f"Failed to upload {src} to {key}: {e}")
            return False

    async def delete_file(self, filename: str) -> bool:
        """Delete file from storage."""
        file_path = os.path.join(self.upload_dir, filename)
        if os.path.exists(file_path):
            try:
                await asyncio.to_thread(os.remove, file_path)
                return True
            except Exception as e:
                logging.error(f"Failed to delete {filename}: {e}")
                return False
        return True

storage_manager = StorageManager()