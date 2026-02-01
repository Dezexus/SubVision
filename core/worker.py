import gc
import logging
import threading
import time
import traceback
from collections.abc import Callable
from typing import Any

from .image_pipeline import ImagePipeline
from .llm_engine import LLMFixer
from .ocr_engine import PaddleWrapper
from .presets import get_preset_config
from .subtitle_aggregator import SubtitleAggregator
from .utils import format_timestamp
from .video_provider import VideoProvider

logger = logging.getLogger(__name__)


class OCRWorker(threading.Thread):
    """Orchestrates video processing, OCR, and subtitle generation."""

    def __init__(
        self,
        params: dict[str, Any],
        callbacks: dict[str, Callable[..., Any]],
    ) -> None:
        super().__init__()
        self.params = params
        self.cb = callbacks
        self.is_running = True

    def stop(self) -> None:
        """Signals the worker to stop processing."""
        self.is_running = False

    def run(self) -> None:
        """Main execution loop."""
        srt_data: list[dict[str, Any]] = []
        video: VideoProvider | None = None
        ocr_engine: PaddleWrapper | None = None

        try:
            self._log("--- START OCR ---")

            preset_name = str(self.params.get("preset_name", "⚖️ Balance"))
            config = get_preset_config(preset_name)

            config.update(
                {
                    "step": self.params.get("step", config["step"]),
                    "clahe": self.params.get("clip_limit", config["clahe"]),
                    "smart_skip": self.params.get("smart_skip", config["smart_skip"]),
                    "min_conf": self.params.get("min_conf", 0.80),
                }
            )

            video_path = str(self.params["video_path"])
            video = VideoProvider(video_path, step=int(config["step"]))

            roi = self.params.get("roi", [0, 0, 0, 0])
            pipeline = ImagePipeline(roi=roi, config=config)

            aggregator = SubtitleAggregator(min_conf=float(config["min_conf"]))
            aggregator.on_new_subtitle = self._emit_subtitle

            ocr_engine = PaddleWrapper(lang=str(self.params.get("langs", "en")))

            last_ocr_result = ("", 0.0)
            start_time = time.time()

            for frame_idx, timestamp, frame in video:
                if not self.is_running:
                    break

                self._update_progress(frame_idx, video.total_frames, start_time)

                final_img, skipped = pipeline.process(frame)

                if skipped:
                    text, conf = last_ocr_result
                elif final_img is not None:
                    try:
                        res = ocr_engine.predict(final_img)
                        text, conf = PaddleWrapper.parse_results(res, self.params.get("conf", 0.5))
                    except Exception:
                        text, conf = "", 0.0
                    last_ocr_result = (text, conf)
                else:
                    text, conf = "", 0.0

                aggregator.add_result(text, conf, timestamp)

            srt_data = aggregator.finalize()
            self._log(f"Smart Skip: {pipeline.skipped_count} frames")

            if self.params.get("use_llm", False) and srt_data:
                self._run_llm_fixer(srt_data)

            self._save_to_file(srt_data)
            self.cb.get("finish", lambda x: None)(True)  # type: ignore[no-untyped-call]

        except Exception as e:
            self._log(f"CRITICAL: {e}\n{traceback.format_exc()}")
            self.cb.get("finish", lambda x: None)(False)  # type: ignore[no-untyped-call]
        finally:
            if video:
                video.release()
            if ocr_engine:
                del ocr_engine
            gc.collect()
            try:
                import paddle

                paddle.device.cuda.empty_cache()
            except ImportError:
                pass

    def _update_progress(self, current: int, total: int, start_time: float) -> None:
        """Calculates ETA and triggers the progress callback."""
        if self.cb.get("progress"):
            elapsed = time.time() - start_time
            eta_str = "--:--"
            if current > 0:
                avg_time = elapsed / current
                remain = total - current
                eta_sec = int(remain * avg_time)
                eta_str = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
            self.cb["progress"](current, total, eta_str)

    def _log(self, msg: str) -> None:
        """Sends a log message to the callback."""
        if self.cb.get("log"):
            self.cb["log"](msg)

    def _emit_subtitle(self, item: dict[str, Any]) -> None:
        """Sends a generated subtitle item to the callback."""
        if self.cb.get("subtitle"):
            self.cb["subtitle"](item)

    def _emit_ai_update(self, item: dict[str, Any]) -> None:
        """Sends an AI-corrected subtitle item to the callback."""
        if self.cb.get("ai_update"):
            self.cb["ai_update"](item)

    def _run_llm_fixer(self, srt_data: list[dict[str, Any]]) -> None:
        """Runs the LLM post-processing pipeline."""
        self._log("--- AI Editing ---")
        fixer = LLMFixer(self._log)
        repo = str(self.params.get("llm_repo", "bartowski/google_gemma-3-4b-it-GGUF"))
        fname = str(self.params.get("llm_filename", "google_gemma-3-4b-it-Q4_K_M.gguf"))
        prompt = self.params.get("llm_prompt")

        if fixer.load_model(repo, fname):
            raw_langs = str(self.params.get("langs", "en"))
            user_lang = raw_langs.replace(",", "+").split("+")[0].strip()
            fixer.fix_subtitles(srt_data, lang=user_lang, prompt_template=prompt)
            for item in srt_data:
                self._emit_ai_update(item)
            fixer.unload()

    def _save_to_file(self, srt_data: list[dict[str, Any]]) -> None:
        """Writes the generated subtitles to a .srt file."""
        output_path = str(self.params["output_path"])
        try:
            with open(output_path, "w", encoding="utf-8") as f:
                for item in srt_data:
                    f.write(
                        f"{item['id']}\n"
                        f"{format_timestamp(item['start'])} --> {format_timestamp(item['end'])}\n"
                        f"{item['text']}\n\n"
                    )
            self._log(f"Saved: {output_path}")
        except OSError as e:
            self._log(f"Error saving file: {e}")
