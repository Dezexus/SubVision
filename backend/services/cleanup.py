import os
import time
import logging

logger = logging.getLogger(__name__)
UPLOAD_DIR = "uploads"

def cleanup_old_files(max_age_hours: int = 24):
    """
    Deletes files in the upload directory that are older than max_age_hours.
    """
    if not os.path.exists(UPLOAD_DIR):
        return

    logger.info("Running cleanup task...")
    now = time.time()
    cutoff = now - (max_age_hours * 3600)

    count = 0
    deleted_size = 0

    try:
        for filename in os.listdir(UPLOAD_DIR):
            file_path = os.path.join(UPLOAD_DIR, filename)

            # Пропускаем, если это не файл
            if not os.path.isfile(file_path):
                continue

            # Пропускаем .gitkeep или служебные файлы, если есть
            if filename.startswith("."):
                continue

            try:
                file_mtime = os.path.getmtime(file_path)
                if file_mtime < cutoff:
                    file_size = os.path.getsize(file_path)
                    os.remove(file_path)
                    count += 1
                    deleted_size += file_size
            except OSError as e:
                logger.warning(f"Error deleting {filename}: {e}")

        if count > 0:
            mb_size = deleted_size / (1024 * 1024)
            logger.info(f"Cleanup complete. Removed {count} files ({mb_size:.2f} MB).")

    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
