"""
This module provides a cleanup utility to periodically remove old files
from the upload directory to conserve disk space.
"""
import os
import time
import logging

logger = logging.getLogger(__name__)
UPLOAD_DIR = "uploads"

def cleanup_old_files(max_age_hours: int = 24):
    """
    Deletes files in the specified upload directory that are older than
    the given number of hours.

    Args:
        max_age_hours: The maximum age of a file in hours before it is deleted.
    """
    if not os.path.exists(UPLOAD_DIR):
        return

    logger.info(f"Running cleanup task for files older than {max_age_hours} hours...")
    now = time.time()
    cutoff = now - (max_age_hours * 3600)
    count = 0
    deleted_size = 0

    try:
        for filename in os.listdir(UPLOAD_DIR):
            file_path = os.path.join(UPLOAD_DIR, filename)

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

        if count > 0:
            mb_size = deleted_size / (1024 * 1024)
            logger.info(f"Cleanup complete. Removed {count} old files, freeing {mb_size:.2f} MB.")

    except Exception as e:
        logger.error(f"An unexpected error occurred during the cleanup process: {e}")
