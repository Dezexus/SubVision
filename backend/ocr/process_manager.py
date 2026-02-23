"""
Process manager for handling background OCR worker threads safely using per-session locks.
"""
import os
import logging
import concurrent.futures
from collections.abc import Callable
from typing import Any, Optional
import threading

from core.geometry import calculate_roi_from_mask
from ocr.worker import OCRWorker

logger = logging.getLogger(__name__)


class ProcessManager:
    """
    Manages lifecycle and fine-grained thread synchronization for OCR processing tasks.
    """

    def __init__(self) -> None:
        self.workers_registry: dict[str, OCRWorker] = {}
        self._session_locks: dict[str, threading.Lock] = {}
        self._registry_lock = threading.Lock()

    def _get_session_lock(self, session_id: str) -> threading.Lock:
        """
        Retrieves or creates a dedicated threading lock for a specific session.
        """
        with self._registry_lock:
            if session_id not in self._session_locks:
                self._session_locks[session_id] = threading.Lock()
            return self._session_locks[session_id]

    def start_process(
        self,
        session_id: str,
        video_file: str,
        editor_data: dict[str, Any] | None,
        preset: str,
        langs: str,
        step: int,
        conf_threshold: float,
        scale_val: float,
        smart_skip: bool,
        callbacks: dict[str, Callable[..., Any]],
        thread_pool: Optional[concurrent.futures.ThreadPoolExecutor] = None,
    ) -> str:
        """
        Starts a new OCR worker thread for a session without blocking other clients.
        """
        session_lock = self._get_session_lock(session_id)

        with session_lock:
            with self._registry_lock:
                has_active_worker = session_id in self.workers_registry

            if has_active_worker:
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
                "preset": preset,
                "langs": langs,
                "step": int(step),
                "conf": 0.5,
                "min_conf": conf_threshold / 100.0,
                "roi": roi_state,
                "scale_factor": scale_val,
                "smart_skip": smart_skip,
                "thread_pool": thread_pool,
            }

            worker = OCRWorker(params, callbacks)

            with self._registry_lock:
                self.workers_registry[session_id] = worker

            worker.start()

            return output_srt

    def stop_process(self, session_id: str) -> bool:
        """
        Safely stops and unregisters an active OCR worker thread for a specific session.
        """
        session_lock = self._get_session_lock(session_id)
        with session_lock:
            return self._stop_worker_sync(session_id)

    def _stop_worker_sync(self, session_id: str) -> bool:
        """
        Internally stops a worker using a multi-attempt join strategy.
        """
        with self._registry_lock:
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
