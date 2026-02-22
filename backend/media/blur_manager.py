"""
Manager responsible for multi-threaded video rendering and async FFmpeg orchestration.
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
from core.video_io import extract_frame_cv2

logger = logging.getLogger(__name__)

try:
    count = cv2.cuda.getCudaEnabledDeviceCount()
    HAS_CUDA = count > 0
except AttributeError:
    HAS_CUDA = False

class BlurManager:
    """
    Manages the accelerated rendering pipeline handling queues and async subprocess execution.
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

    async def _run_subprocess_cancellable(self, cmd: List[str]) -> None:
        """
        Executes a subprocess asynchronously and safely terminates it if the stop event is triggered.
        """
        process = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL
        )

        while process.returncode is None:
            if self._stop_event.is_set():
                try:
                    process.terminate()
                    await asyncio.wait_for(process.wait(), timeout=2.0)
                except asyncio.TimeoutError:
                    process.kill()
                raise InterruptedError("Process was cancelled by user.")

            try:
                await asyncio.wait_for(process.wait(), timeout=0.5)
            except asyncio.TimeoutError:
                continue

        if process.returncode != 0:
            raise RuntimeError(f"Command failed with code {process.returncode}")

    async def apply_blur_task(
            self,
            video_path: str,
            subtitles: List[Dict[str, Any]],
            blur_settings: Dict[str, Any],
            output_path: str,
            progress_callback=None
    ) -> str:
        """
        Executes the full video obscuring and accelerated hardware rendering pipeline asynchronously.
        """
        self._is_running = True
        self._stop_event.clear()

        base_name, ext = os.path.splitext(output_path)
        temp_video_path = f"{base_name}_temp{ext}"

        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_ANY])
        ok, _ = cap.read()

        if not ok:
            cap.release()
            cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])
        else:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

        if not cap.isOpened():
            raise ValueError("Could not open video file")

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        writer = cv2.VideoWriter(temp_video_path, fourcc, fps, (width, height))

        frame_blur_map: Dict[int, Tuple[int, int, int, int]] = {}
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
                frame_blur_map[f_idx] = roi

        read_queue = queue.Queue(maxsize=30)
        write_queue = queue.Queue(maxsize=30)
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
                        frame = apply_blur_to_frame(frame, frame_blur_map[idx], blur_settings)

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
                logger.info("Transcoding to H.264 using NVENC and attempting audio copy...")

                base_cmd = [
                    "ffmpeg", "-y",
                    "-i", temp_video_path,
                    "-i", video_path,
                    "-map", "0:v:0",
                    "-map", "1:a:0?",
                    "-shortest"
                ]

                nvenc_params = [
                    "-c:v", "h264_nvenc",
                    "-preset", "p4",
                    "-cq", "23",
                    "-pix_fmt", "yuv420p"
                ]

                x264_params = [
                    "-c:v", "libx264",
                    "-preset", "veryfast",
                    "-crf", "23",
                    "-pix_fmt", "yuv420p"
                ]

                try:
                    cmd_nvenc_copy = base_cmd + nvenc_params + ["-c:a", "copy", output_path]
                    await self._run_subprocess_cancellable(cmd_nvenc_copy)
                except RuntimeError:
                    try:
                        logger.warning("NVENC audio copy failed, falling back to AAC with NVENC...")
                        cmd_nvenc_aac = base_cmd + nvenc_params + ["-c:a", "aac", output_path]
                        await self._run_subprocess_cancellable(cmd_nvenc_aac)
                    except RuntimeError:
                        logger.warning("NVENC encoding failed, falling back to software libx264...")
                        cmd_x264_aac = base_cmd + x264_params + ["-c:a", "aac", output_path]
                        await self._run_subprocess_cancellable(cmd_x264_aac)

                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                return output_path
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
