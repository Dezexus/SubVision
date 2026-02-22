"""
This module provides a cleanup utility to periodically remove old cached files
and abandoned upload chunks to conserve local disk space.
"""
import os
import time
import logging
import shutil

logger = logging.getLogger(__name__)
CACHE_DIR = "cache"
TEMP_UPLOAD_DIR = os.path.join(CACHE_DIR, ".temp")

def cleanup_old_files(max_age_hours: int = 24) -> None:
    """
    Deletes outdated files and abandoned temporary upload directories from the local cache.
    """
    if not os.path.exists(CACHE_DIR):
        return

    logger.info(f"Running cleanup task for cached files older than {max_age_hours} hours...")
    now = time.time()
    cutoff = now - (max_age_hours * 3600)
    count = 0
    deleted_size = 0

    try:
        for filename in os.listdir(CACHE_DIR):
            file_path = os.path.join(CACHE_DIR, filename)

            if not os.path.isfile(file_path) or filename.startswith("."):
                continue

            try:
                file_mtime = os.path.getmtime(file_path)
                if file_mtime < cutoff:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    count += 1
                    deleted_size += file_size
            except OSError as e:
                logger.warning(f"Could not delete file {filename}: {e}")

        if os.path.exists(TEMP_UPLOAD_DIR):
            for temp_dir_name in os.listdir(TEMP_UPLOAD_DIR):
                temp_dir_path = os.path.join(TEMP_UPLOAD_DIR, temp_dir_name)

                if not os.path.isdir(temp_dir_path):
                    continue

                try:
                    dir_mtime = os.path.getmtime(temp_dir_path)
                    if dir_mtime < cutoff:
                        shutil.rmtree(temp_dir_path)
                        count += 1
                except OSError as e:
                    logger.warning(f"Could not delete temp directory {temp_dir_name}: {e}")

        if count > 0:
            mb_size = deleted_size / (1024 * 1024)
            logger.info(f"Cleanup complete. Removed {count} old items, freeing {mb_size:.2f} MB.")

    except Exception as e:
        logger.error(f"An unexpected error occurred during the cleanup process: {e}")
