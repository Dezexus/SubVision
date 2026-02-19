import gc
import logging
import queue
import threading
import time
import os
from collections.abc import Callable
from typing import Any
import numpy as np
import cv2

try:
    import paddle
    HAS_PADDLE = True
except ImportError:
    HAS_PADDLE = False

from .image_pipeline import ImagePipeline
from .ocr_engine import PaddleWrapper, get_paddle_engine
from .presets import get_preset_config
from .subtitle_aggregator import SubtitleAggregator
from .utils import format_timestamp
from .video_provider import VideoProvider

logger = logging.getLogger(__name__)
SENTINEL = object()

class OCRWorker(threading.Thread):
    """Worker thread executing frame extraction, processing, and batch OCR inference with Watchdog."""

    def __init__(self, params: dict[str, Any], callbacks: dict[str, Callable[..., Any]]) -> None:
        super().__init__()
        self.params = params
        self.cb = callbacks
        self.is_running = True
        self.frame_queue: queue.Queue[Any] = queue.Queue(maxsize=30)
        self.producer_error: Exception | None = None
        self._stop_event = threading.Event()
        self.last_ocr_result = ("", 0.0)

    def stop(self) -> None:
        """Signals the worker to stop processing immediately."""
        self.is_running = False
        self._stop_event.set()
        try:
            while not self.frame_queue.empty():
                self.frame_queue.get_nowait()
        except queue.Empty:
            pass

    def _producer_loop(self, video: VideoProvider, pipeline: ImagePipeline) -> None:
        """Reads and processes video frames, pushing them to the queue."""
        cv2.setNumThreads(0)
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

    def _process_batch(self, pending_items: list[Any], valid_frames: list[np.ndarray], ocr_engine: Any, aggregator: Any, total_frames: int, start_time: float) -> None:
        """Processes accumulated frames in a single batch to maximize GPU utilization."""
        if valid_frames:
            try:
                batch_results = ocr_engine.predict_batch(valid_frames)
            except Exception as e:
                logger.error(f"Batch OCR error: {e}")
                batch_results = [None] * len(valid_frames)
        else:
            batch_results = []

        res_idx = 0
        for item in pending_items:
            frame_idx, timestamp, final_img, skipped = item

            self._update_progress(frame_idx, total_frames, start_time)

            if skipped:
                text, conf = self.last_ocr_result
            elif final_img is not None:
                raw_res = batch_results[res_idx] if res_idx < len(batch_results) else None
                res_idx += 1
                try:
                    text, conf = PaddleWrapper.parse_results(raw_res, self.params.get("conf", 0.5))
                except Exception:
                    text, conf = "", 0.0
                self.last_ocr_result = (text, conf)
            else:
                text, conf = "", 0.0

            aggregator.add_result(text, conf, timestamp)

        if HAS_PADDLE:
            try:
                paddle.device.cuda.empty_cache()
            except Exception:
                pass

    def run(self) -> None:
        """Main execution loop accumulating batches for the OCR pipeline with Watchdog monitoring."""
        video: VideoProvider | None = None
        producer_thread: threading.Thread | None = None
        self.last_ocr_result = ("", 0.0)

        try:
            self._log("--- START OCR (Batched GPU Pipeline) ---")

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

            ocr_engine = get_paddle_engine(lang=str(self.params.get("langs", "en")), use_gpu=True)

            aggregator = SubtitleAggregator(min_conf=float(config["min_conf"]), fps=video.fps)
            aggregator.on_new_subtitle = self._emit_subtitle

            producer_thread = threading.Thread(target=self._producer_loop, args=(video, pipeline), daemon=True)
            producer_thread.start()

            start_time = time.time()
            last_activity_time = time.time()
            total_frames = video.total_frames

            pending_items = []
            valid_frames = []
            batch_size = 4

            while self.is_running and not self._stop_event.is_set():
                try:
                    item = self.frame_queue.get(timeout=0.2)
                    if item is not None:
                        last_activity_time = time.time()
                except queue.Empty:
                    item = None
                    if time.time() - last_activity_time > 45.0:
                        raise TimeoutError("Watchdog Timeout: Decoder or Processing Thread Deadlocked.")

                if producer_thread and not producer_thread.is_alive() and self.frame_queue.empty() and item is None:
                    item = SENTINEL

                if item is SENTINEL:
                    if self.producer_error:
                        raise self.producer_error
                    if pending_items:
                        self._process_batch(pending_items, valid_frames, ocr_engine, aggregator, total_frames, start_time)
                        pending_items.clear()
                        valid_frames.clear()
                    break

                if item is not None:
                    pending_items.append(item)
                    frame_idx, timestamp, final_img, skipped = item
                    if not skipped and final_img is not None:
                        valid_frames.append(final_img)
                    self.frame_queue.task_done()

                if len(valid_frames) >= batch_size or (item is None and pending_items):
                    if not self.is_running or self._stop_event.is_set():
                        break
                    self._process_batch(pending_items, valid_frames, ocr_engine, aggregator, total_frames, start_time)
                    pending_items.clear()
                    valid_frames.clear()
                    last_activity_time = time.time()

            if self.is_running and not self._stop_event.is_set():
                self._update_progress(total_frames, total_frames, start_time)
                srt_data = aggregator.finalize()
                self._log(f"Smart Skip: {pipeline.skipped_count} frames")
                self._save_to_file(srt_data)
                if self.cb.get("finish"):
                    self.cb["finish"](True)
            else:
                self._log("Process stopped by user.")
                if self.cb.get("finish"):
                    self.cb["finish"](False)

        except Exception as e:
            self._log(f"CRITICAL ERROR: {e}")
            if self.cb.get("finish"):
                self.cb["finish"](False)
        finally:
            self.is_running = False
            self._stop_event.set()

            if video:
                video.release()

            try:
                while not self.frame_queue.empty():
                    self.frame_queue.get_nowait()
            except Exception:
                pass

            if HAS_PADDLE:
                try:
                    paddle.device.cuda.empty_cache()
                except Exception:
                    pass

            gc.collect()

    def _update_progress(self, current: int, total: int, start_time: float) -> None:
        """Calculates ETA and triggers progress callbacks."""
        if self.cb.get("progress") and current > 0:
            elapsed = time.time() - start_time
            avg_time = elapsed / current
            eta_sec = int((total - current) * avg_time)
            eta_str = f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"
            self.cb["progress"](current, total, eta_str)

    def _log(self, msg: str) -> None:
        """Safely invokes the logging callback if provided."""
        if self.cb.get("log"):
            self.cb["log"](msg)

    def _emit_subtitle(self, item: dict[str, Any]) -> None:
        """Triggers the subtitle event callback."""
        if self.cb.get("subtitle"):
            self.cb["subtitle"](item)

    def _save_to_file(self, srt_data: list[dict[str, Any]]) -> None:
        """Writes parsed subtitles to disk in SRT format."""
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
