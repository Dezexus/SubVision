import os
from collections.abc import Callable
from typing import Any

from core.image_ops import calculate_roi_from_mask
from core.worker import OCRWorker


class ProcessManager:
    """Manages background OCR worker threads per session."""

    def __init__(self) -> None:
        self.workers_registry: dict[str, OCRWorker] = {}

    def start_process(
        self,
        session_id: str,
        video_file: str,
        editor_data: dict[str, Any] | None,
        langs: str,
        step: int,
        conf_threshold: float,
        use_llm: bool,
        clahe_val: float,
        smart_skip: bool,
        visual_cutoff: bool,
        llm_repo: str,
        llm_file: str,
        llm_prompt: str | None,
        callbacks: dict[str, Callable[..., Any]],
    ) -> str:
        """Starts a new OCR processing task."""
        if session_id in self.workers_registry:
            self.stop_process(session_id)

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
            "use_llm": use_llm,
            "clip_limit": clahe_val,
            "smart_skip": smart_skip,
            "visual_cutoff": visual_cutoff,
            "llm_repo": llm_repo,
            "llm_filename": llm_file,
            "llm_prompt": llm_prompt,
        }

        worker = OCRWorker(params, callbacks)
        self.workers_registry[session_id] = worker
        worker.start()
        return output_srt

    def stop_process(self, session_id: str) -> bool:
        """Stops and removes the worker for the given session."""
        if session_id in self.workers_registry:
            self.workers_registry[session_id].stop()
            del self.workers_registry[session_id]
            return True
        return False
