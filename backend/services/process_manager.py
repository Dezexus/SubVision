"""
Process manager for handling background OCR worker threads safely.
"""
import os
import logging
from collections.abc import Callable
from typing import Any
import threading

from core.image_ops import calculate_roi_from_mask
from core.worker import OCRWorker

logger = logging.getLogger(__name__)

class ProcessManager:
    """Manages lifecycle and thread synchronization for OCR processing tasks."""

    def __init__(self) -> None:
        """Initializes the manager and thread lock."""
        self.workers_registry: dict[str, OCRWorker] = {}
        self._lock = threading.Lock()

    def start_process(
        self,
        session_id: str,
        video_file: str,
        editor_data: dict[str, Any] | None,
        langs: str,
        step: int,
        conf_threshold: float,
        clahe_val: float,
        scale_val: float,
        smart_skip: bool,
        visual_cutoff: bool,
        callbacks: dict[str, Callable[..., Any]],
    ) -> str:
        """Starts a new OCR worker thread safely after stopping any existing one."""
        with self._lock:
            if session_id in self.workers_registry:
                self._stop_worker_sync(session_id)

            roi_state = editor_data.get("roi_override") if editor_data else None
            if not roi_state:
                roi_state = calculate_roi_from_mask(editor_data)

            base_name, _ = os.path.splitext(video_file)
            output_srt = f"{base_name}.srt"

            if os.path.exists(output_srt):
                try:
                    os.remove(output_srt)
                except OSError:
                    pass

            params: dict[str, Any] = {
                "video_path": video_file,
                "output_path": output_srt,
                "langs": langs,
                "step": int(step),
                "conf": 0.5,
                "min_conf": conf_threshold / 100.0,
                "roi": roi_state,
                "clip_limit": clahe_val,
                "scale_factor": scale_val,
                "smart_skip": smart_skip,
                "visual_cutoff": visual_cutoff,
            }

            worker = OCRWorker(params, callbacks)
            self.workers_registry[session_id] = worker
            worker.start()

            return output_srt

    def stop_process(self, session_id: str) -> bool:
        """Safely stops and unregisters an active OCR worker thread."""
        with self._lock:
            return self._stop_worker_sync(session_id)

    def _stop_worker_sync(self, session_id: str) -> bool:
        """Internally stops a worker using a multi-attempt join strategy."""
        worker = self.workers_registry.pop(session_id, None)

        if worker:
            if worker.is_alive():
                worker.stop()

                max_attempts = 3
                timeout_per_attempt = 2.0

                for attempt in range(max_attempts):
                    worker.join(timeout=timeout_per_attempt)
                    if not worker.is_alive():
                        break

                if worker.is_alive():
                    logger.error(
                        f"Critical: Worker {session_id} failed to terminate "
                        f"after {max_attempts * timeout_per_attempt}s."
                    )

            del worker
            return True

        return False
