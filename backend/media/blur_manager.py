"""
Manager responsible for coordinating multi-threaded video rendering and effect application.
"""
import cv2
import numpy as np
import logging
import os
import asyncio
import threading
import queue
from typing import Optional, Tuple, List, Dict, Any

from core.geometry import calculate_blur_roi
from core.blur_effects import apply_blur_to_frame
from core.video_io import extract_frame_cv2, create_video_capture
from core.constants import MAX_QUEUE_SIZE, DEFAULT_FPS
from media.mask_generator import MaskGenerator
from media.transcoder import FFmpegTranscoder

logger = logging.getLogger(__name__)

class BlurManager:
    """
    Orchestrates the asynchronous video reading, processing, and writing queues.
    """

    def __init__(self) -> None:
        self._stop_event = threading.Event()
        self._is_running = False

    def stop(self) -> None:
        """
        Signals the rendering process to abort immediately.
        """
        self._is_running = False
        self._stop_event.set()

    def generate_preview(self, video_path: str, frame_index: int, settings: Dict[str, Any], text: str) -> Optional[np.ndarray]:
        """
        Generates a single preview frame with the obscuring filter applied.
        """
        cached_frame = extract_frame_cv2(video_path, frame_index)
        if cached_frame is None:
            return None

        frame = cached_frame.copy()
        height, width = frame.shape[:2]

        roi = calculate_blur_roi(text, width, height, settings)
        return apply_blur_to_frame(frame, roi, settings)

    async def apply_blur_task(
            self,
            video_path: str,
            subtitles: List[Dict[str, Any]],
            blur_settings: Dict[str, Any],
            output_path: str,
            progress_callback=None
    ) -> str:
        """
        Executes the full video obscuring and rendering pipeline asynchronously.
        """
        self._is_running = True
        self._stop_event.clear()

        base_name, ext = os.path.splitext(output_path)
        temp_video_path = f"{base_name}_temp{ext}"

        cap = create_video_capture(video_path)

        if not cap.isOpened():
            raise ValueError("Could not open video file")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or DEFAULT_FPS
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(temp_video_path, fourcc, fps, (width, height))

        subtitle_masks = MaskGenerator.generate_best_masks(
            video_path, subtitles, blur_settings, width, height, fps, total_frames
        )

        frame_blur_map: Dict[int, Tuple[Tuple[int, int, int, int], int]] = {}
        for sub in subtitles:
            text = sub.get('text', '').strip()
            if not text:
                continue
            roi = calculate_blur_roi(text, width, height, blur_settings)
            start_f = int(sub['start'] * fps)
            end_f = int(sub['end'] * fps)
            start_f = max(0, start_f - 1)
            end_f = min(total_frames + 5, end_f + 1)
            for f_idx in range(start_f, end_f):
                frame_blur_map[f_idx] = (roi, sub.get('id', -1))

        read_queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
        write_queue = queue.Queue(maxsize=MAX_QUEUE_SIZE)
        exception_queue = queue.Queue()

        task_stop = threading.Event()

        def reader_thread() -> None:
            try:
                frame_idx = 0
                while not task_stop.is_set() and not self._stop_event.is_set():
                    ret, frame = cap.read()
                    if not ret:
                        break
                    read_queue.put((frame_idx, frame))
                    frame_idx += 1
                read_queue.put(None)
            except Exception as e:
                exception_queue.put(e)

        def processor_thread() -> None:
            try:
                while not task_stop.is_set() and not self._stop_event.is_set():
                    try:
                        item = read_queue.get(timeout=1.0)
                    except queue.Empty:
                        continue

                    if item is None:
                        write_queue.put(None)
                        break

                    idx, frame = item
                    if idx in frame_blur_map:
                        roi, sub_id = frame_blur_map[idx]
                        precalc_mask = subtitle_masks.get(sub_id)
                        frame = apply_blur_to_frame(frame, roi, blur_settings, precalculated_mask=precalc_mask)

                    write_queue.put(frame)

                    if progress_callback and idx % 25 == 0:
                        progress_callback(idx, total_frames)
            except Exception as e:
                exception_queue.put(e)

        def writer_thread() -> None:
            try:
                while not task_stop.is_set() and not self._stop_event.is_set():
                    try:
                        frame = write_queue.get(timeout=1.0)
                    except queue.Empty:
                        continue

                    if frame is None:
                        break
                    writer.write(frame)
            except Exception as e:
                exception_queue.put(e)

        t_read = threading.Thread(target=reader_thread, daemon=True)
        t_proc = threading.Thread(target=processor_thread, daemon=True)
        t_write = threading.Thread(target=writer_thread, daemon=True)

        try:
            t_read.start()
            t_proc.start()
            t_write.start()

            while t_write.is_alive():
                await asyncio.sleep(0.5)
                if self._stop_event.is_set():
                    task_stop.set()
                    raise InterruptedError("Stopped by user")
                if not exception_queue.empty():
                    raise exception_queue.get()

            if progress_callback and not self._stop_event.is_set():
                progress_callback(total_frames, total_frames)

        except Exception as e:
            task_stop.set()
            logger.error(f"Render interrupted: {e}")
            raise e
        finally:
            task_stop.set()
            cap.release()
            writer.release()

            while not read_queue.empty():
                read_queue.get_nowait()
            while not write_queue.empty():
                write_queue.get_nowait()

        if not self._stop_event.is_set():
            try:
                return await FFmpegTranscoder.transcode_with_audio(
                    temp_video_path, video_path, output_path, self._stop_event
                )
            except Exception as e:
                logger.error(f"FFmpeg failed or was interrupted: {e}")
                if os.path.exists(temp_video_path):
                    if os.path.exists(output_path):
                        os.remove(output_path)
                    os.rename(temp_video_path, output_path)
                raise e
        else:
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
            raise InterruptedError("Render stopped by user")
