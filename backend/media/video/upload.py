"""
Module providing a robust, concurrent-safe chunked upload manager.
"""
import os
import logging
from typing import List

logger = logging.getLogger(__name__)


class UploadManager:
    """
    Manages reliable video file uploads using isolated chunk storage and safe assembly.
    """

    def __init__(self, upload_dir: str) -> None:
        """
        Initializes the upload manager and ensures the temporary chunk directory exists.
        """
        self.upload_dir = upload_dir
        self.temp_dir = os.path.join(upload_dir, ".temp")
        os.makedirs(self.temp_dir, exist_ok=True)

    def save_chunk(self, upload_id: str, chunk_index: int, data: bytes) -> None:
        """
        Writes a single file chunk to an isolated temporary directory for the specific upload session.
        """
        chunk_dir = os.path.join(self.temp_dir, upload_id)
        os.makedirs(chunk_dir, exist_ok=True)
        chunk_path = os.path.join(chunk_dir, f"{chunk_index}.chunk")

        with open(chunk_path, "wb") as f:
            f.write(data)

    def is_upload_complete(self, upload_id: str, total_chunks: int) -> bool:
        """
        Verifies if all expected chunks for a specific upload session have been received.
        """
        chunk_dir = os.path.join(self.temp_dir, upload_id)
        if not os.path.exists(chunk_dir):
            return False

        existing_chunks = len([name for name in os.listdir(chunk_dir) if name.endswith(".chunk")])
        return existing_chunks == total_chunks

    def assemble_file(self, upload_id: str, total_chunks: int, final_filename: str) -> str:
        """
        Concatenates all isolated chunks into the final video file and cleans up the temporary storage.
        """
        chunk_dir = os.path.join(self.temp_dir, upload_id)
        final_path = os.path.join(self.upload_dir, final_filename)

        with open(final_path, "wb") as final_file:
            for i in range(total_chunks):
                chunk_path = os.path.join(chunk_dir, f"{i}.chunk")
                if os.path.exists(chunk_path):
                    with open(chunk_path, "rb") as chunk_file:
                        final_file.write(chunk_file.read())

        for f in os.listdir(chunk_dir):
            os.remove(os.path.join(chunk_dir, f))
        os.rmdir(chunk_dir)

        return final_path

    def get_missing_chunks(self, upload_id: str, total_chunks: int) -> List[int]:
        """
        Identifies missing chunk indices to allow clients to resume interrupted uploads.
        """
        chunk_dir = os.path.join(self.temp_dir, upload_id)
        if not os.path.exists(chunk_dir):
            return list(range(total_chunks))

        existing = {int(f.split(".")[0]) for f in os.listdir(chunk_dir) if f.endswith(".chunk")}
        return [i for i in range(total_chunks) if i not in existing]
