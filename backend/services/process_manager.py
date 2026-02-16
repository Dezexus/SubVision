"""
This module defines the ProcessManager class, which is responsible for
creating, managing, and terminating background OCR worker threads.
"""
import os
from collections.abc import Callable
from typing import Any

from core.image_ops import calculate_roi_from_mask
from core.worker import OCRWorker


class ProcessManager:
    """
    Manages background OCR worker threads on a per-session basis, handling
    the lifecycle of each processing task.
    """

    def __init__(self) -> None:
        """Initializes the manager with a registry for active workers."""
        self.workers_registry: dict[str, OCRWorker] = {}

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
        """
        Initializes and starts a new OCR processing task in a background thread.
        If a worker for the session already exists, it is stopped first.

        Args:
            session_id: A unique identifier for the user session.
            video_file: Path to the input video file.
            editor_data: Data from the UI, potentially containing a mask for ROI.
            langs: The language(s) for OCR.
            step: Frame processing interval.
            conf_threshold: Minimum confidence threshold for text recognition.
            clahe_val: CLAHE clip limit for image enhancement.
            scale_val: The factor by which to scale the image.
            smart_skip: Whether to skip processing for static frames.
            visual_cutoff: A parameter for visual-based frame analysis.
            callbacks: A dictionary of functions for real-time feedback.

        Returns:
            The path to the generated SRT output file.
        """
        if session_id in self.workers_registry:
            self.stop_process(session_id)

        roi_state = editor_data.get("roi_override") or calculate_roi_from_mask(editor_data)

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
        """
        Stops and removes the worker for the given session ID.

        Args:
            session_id: The identifier of the session to stop.

        Returns:
            True if a worker was found and stopped, False otherwise.
        """
        worker = self.workers_registry.pop(session_id, None)
        if worker:
            worker.stop()
            return True
        return False
