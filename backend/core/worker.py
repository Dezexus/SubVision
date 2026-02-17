"""
This module defines the OCRWorker, a threaded class responsible for orchestrating
the entire video-to-subtitle process, from frame extraction and image processing
to OCR inference and subtitle aggregation.
"""
import gc
import logging
import queue
import threading
import time
import traceback
from collections.abc import Callable
from typing import Any

from .image_pipeline import ImagePipeline
from .ocr_engine import PaddleWrapper
from .presets import get_preset_config
from .subtitle_aggregator import SubtitleAggregator
from .utils import format_timestamp
from .video_provider import VideoProvider

logger = logging.getLogger(__name__)
SENTINEL = object()

class OCRWorker(threading.Thread):
    """
    Orchestrates the entire OCR process in a separate thread. It manages a
    producer-consumer pattern where one thread reads and processes video frames,
    and the main worker thread performs OCR on them.
    """

    def __init__(self, params: dict[str, Any], callbacks: dict[str, Callable[..., Any]]) -> None:
        """
        Initializes the worker thread.

        Args:
            params: A dictionary of operational parameters.
            callbacks: A dictionary of callback functions for progress, logs, and results.
        """
        super().__init__()
        self.params = params
        self.cb = callbacks
        self.is_running = True
        self.frame_queue: queue.Queue[Any] = queue.Queue(maxsize=30)
        self.producer_error: Exception | None = None
        self._stop_event = threading.Event()

    def stop(self) -> None:
        """Signals the worker to stop processing immediately."""
        self.is_running = False
        self._stop_event.set()

        # Drain the queue to unblock the producer if it's waiting to put
        try:
            while not self.frame_queue.empty():
                self.frame_queue.get_nowait()
        except queue.Empty:
            pass

    def _producer_loop(self, video: VideoProvider, pipeline: ImagePipeline) -> None:
        """
        Reads frames from the video, applies the image processing pipeline,
        and puts the results into a queue for the consumer.
        """
        try:
            for frame_idx, timestamp, frame in video:
                if not self.is_running or self._stop_event.is_set():
                    break

                final_img, skipped = pipeline.process(frame)

                if not self.is_running: break

                try:
                    self.frame_queue.put((frame_idx, timestamp, final_img, skipped), timeout=1.0)
                except queue.Full:
                    if not self.is_running: break
                    continue

            self.frame_queue.put(SENTINEL)
        except Exception as e:
            self.producer_error = e
            self.frame_queue.put(SENTINEL)

    def run(self) -> None:
        """The main execution method of the worker thread."""
        video: VideoProvider | None = None
        ocr_engine: PaddleWrapper | None = None
        producer_thread: threading.Thread | None = None

        try:
            self._log("--- START OCR (Parallel Pipeline) ---")

            preset_name = str(self.params.get("preset_name", "⚖️ Balance"))
            config = get_preset_config(preset_name)
            config.update({
                "step": self.params.get("step", config["step"]),
                "clahe": self.params.get("clip_limit", config["clahe"]),
                "smart_skip": self.params.get("smart_skip", config["smart_skip"]),
                "scale_factor": self.params.get("scale_factor", config["scale_factor"]),
                "min_conf": self.params.get("min_conf", 0.80),
            })

            video = VideoProvider(str(self.params["video_path"]), step=int(config["step"]))
            pipeline = ImagePipeline(roi=self.params.get("roi", [0, 0, 0, 0]), config=config)

            if not self.is_running: return

            ocr_engine = PaddleWrapper(lang=str(self.params.get("langs", "en")))
            aggregator = SubtitleAggregator(min_conf=float(config["min_conf"]), fps=video.fps)
            aggregator.on_new_subtitle = self._emit_subtitle

            producer_thread = threading.Thread(target=self._producer_loop, args=(video, pipeline), daemon=True)
            producer_thread.start()

            last_ocr_result = ("", 0.0)
            start_time = time.time()
            total_frames = video.total_frames

            while self.is_running and not self._stop_event.is_set():
                try:
                    item = self.frame_queue.get(timeout=0.5)
                except queue.Empty:
                    if producer_thread and not producer_thread.is_alive():
                        break
                    continue

                if item is SENTINEL:
                    if self.producer_error:
                        raise self.producer_error
                    break

                frame_idx, timestamp, final_img, skipped = item

                if not self.is_running: break

                self._update_progress(frame_idx, total_frames, start_time)

                if skipped:
                    text, conf = last_ocr_result
                elif final_img is not None:
                    try:
                        if not self.is_running: break
                        res = ocr_engine.predict(final_img)
                        text, conf = PaddleWrapper.parse_results(res, self.params.get("conf", 0.5))
                    except Exception:
                        text, conf = "", 0.0
                    last_ocr_result = (text, conf)
                else:
                    text, conf = "", 0.0

                if not self.is_running: break

                aggregator.add_result(text, conf, timestamp)
                self.frame_queue.task_done()

            # --- ИСПРАВЛЕННЫЙ БЛОК ---
            if self.is_running and not self._stop_event.is_set():
                # Успешное завершение
                srt_data = aggregator.finalize()
                self._log(f"Smart Skip: {pipeline.skipped_count} frames")
                self._save_to_file(srt_data)
                if self.cb.get("finish"):
                    self.cb["finish"](True)
            else:
                # Ручная остановка
                self._log("Process stopped by user.")
                # ВАЖНО: Отправляем сигнал finish(False), чтобы разблокировать кнопку на фронтенде
                if self.cb.get("finish"):
                    self.cb["finish"](False)

        except Exception as e:
            self._log(f"CRITICAL: {e}\n{traceback.format_exc()}")
            if self.cb.get("finish"):
                self.cb["finish"](False)
        finally:
            self.is_running = False
            self._stop_event.set()

            if video:
                video.release()

            if ocr_engine:
                del ocr_engine

            try:
                while not self.frame_queue.empty():
                    self.frame_queue.get_nowait()
            except Exception:
                pass

            gc.collect()
            try:
                import paddle
                if paddle.is_compiled_with_cuda():
                    paddle.device.cuda.empty_cache()
            except (ImportError, AttributeError):
                pass

    def _update_progress(self, current: int, total: int, start_time: float) -> None:
        """Calculates ETA and triggers the progress callback."""
        if self.cb.get("progress") and current > 0:
            elapsed = time.time() - start_time
            avg_time = elapsed / current
            eta_sec = int((total - current) * avg_time)
            eta_str = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
            self.cb["progress"](current, total, eta_str)

    def _log(self, msg: str) -> None:
        """Sends a log message via callback."""
        if self.cb.get("log"):
            self.cb["log"](msg)

    def _emit_subtitle(self, item: dict[str, Any]) -> None:
        """Emits a newly generated subtitle item via callback."""
        if self.cb.get("subtitle"):
            self.cb["subtitle"](item)

    def _save_to_file(self, srt_data: list[dict[str, Any]]) -> None:
        """Saves the final subtitle data to an SRT file."""
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
