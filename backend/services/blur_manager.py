import cv2
import numpy as np
import logging
import os
import subprocess
import threading
import queue
import unicodedata
import math
from typing import Optional, Tuple, List, Dict
from core.image_ops import extract_frame_cv2

logger = logging.getLogger(__name__)

try:
    count = cv2.cuda.getCudaEnabledDeviceCount()
    HAS_CUDA = count > 0
except AttributeError:
    HAS_CUDA = False

class BlurManager:
    """Manages the application of obscuring filters to video frames and accelerated rendering."""

    def __init__(self):
        self._stop_event = threading.Event()
        self._is_running = False

    def stop(self):
        """Signals the rendering process to abort immediately."""
        self._is_running = False
        self._stop_event.set()

    def _estimate_text_width(self, text: str, font_size: int, width_multiplier: float) -> int:
        """Calculates conservative pixel width of text using Unicode character weighting and custom multiplier."""
        width = 0.0
        for char in text:
            ea = unicodedata.east_asian_width(char)
            if ea in ('W', 'F'):
                width += 1.1
            elif char in 'mwWM@OQG':
                width += 0.95
            elif char.isupper():
                width += 0.8
            elif char.isdigit():
                width += 0.65
            elif char in 'il1.,!I|:;tfj':
                width += 0.35
            else:
                width += 0.65
        return int(math.ceil(width * font_size * width_multiplier))

    def _calculate_roi(self, text: str, width: int, height: int, settings: dict) -> Tuple[int, int, int, int]:
        """Calculates the Region of Interest (ROI) bounding box for the given text."""
        if not text:
            return 0, 0, 0, 0

        y_pos = int(settings.get('y', height - 50))
        font_size_px = int(settings.get('font_size', 21))
        width_multiplier = float(settings.get('width_multiplier', 1.0))

        text_h = font_size_px + 4
        text_w = self._estimate_text_width(text, font_size_px, width_multiplier)

        padding_x = int(settings.get('padding_x', 40))
        padding_y_factor = float(settings.get('padding_y', 2.0))
        padding_y_px = int(text_h * padding_y_factor)

        x = (width - text_w) // 2
        y = y_pos - text_h

        final_x = max(0, x - padding_x)
        final_y = max(0, y - padding_y_px)

        raw_w = text_w + (padding_x * 2)
        raw_h = text_h + (padding_y_px * 2)

        final_w = min(width - final_x, raw_w)
        final_h = min(height - final_y, raw_h)

        return final_x, final_y, final_w, final_h

    def _apply_blur_to_frame(self, frame: np.ndarray, roi: Tuple[int, int, int, int], settings: dict) -> np.ndarray:
        """Applies specified obscuring method to a frame ROI."""
        bx, by, bw, bh = roi
        if bw <= 0 or bh <= 0:
            return frame

        mode = settings.get('mode', 'hybrid')
        font_size_px = int(settings.get('font_size', 21))

        if mode == 'hybrid':
            pad = 15
            h, w = frame.shape[:2]

            y1 = max(0, by - pad)
            y2 = min(h, by + bh + pad)
            x1 = max(0, bx - pad)
            x2 = min(w, bx + bw + pad)

            roi_expanded = frame[y1:y2, x1:x2]
            roi_inner = frame[by:by+bh, bx:bx+bw]

            gray = cv2.cvtColor(roi_inner, cv2.COLOR_BGR2GRAY)

            grad_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, grad_kernel)

            _, text_mask = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

            fill_ksize = max(3, int(font_size_px * 0.4))
            fill_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (fill_ksize, fill_ksize))
            text_mask = cv2.morphologyEx(text_mask, cv2.MORPH_CLOSE, fill_kernel)

            dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
            text_mask = cv2.dilate(text_mask, dilate_kernel, iterations=1)

            local_mask = np.zeros(roi_expanded.shape[:2], dtype=np.uint8)

            ly1 = by - y1
            ly2 = ly1 + bh
            lx1 = bx - x1
            lx2 = lx1 + bw

            local_mask[ly1:ly2, lx1:lx2] = text_mask

            inpainted = cv2.inpaint(roi_expanded, local_mask, 3, cv2.INPAINT_TELEA)
            frame[y1:y2, x1:x2] = inpainted

        sigma = int(settings.get('sigma', 5))
        feather = int(settings.get('feather', 30))

        if HAS_CUDA:
            try:
                gpu_frame = cv2.cuda_GpuMat()
                gpu_frame.upload(frame)

                gpu_roi = cv2.cuda_GpuMat(gpu_frame, (bx, by, bw, bh))

                k_size = sigma * 2 + 1
                box_filter = cv2.cuda.createBoxFilter(gpu_roi.type(), -1, (k_size, k_size))

                processed_roi = box_filter.apply(gpu_roi)
                processed_roi = box_filter.apply(processed_roi)
                processed_roi = box_filter.apply(processed_roi)

                if feather > 0:
                    safe_feather_w = int(bw * 0.45)
                    safe_feather_h = int(bh * 0.45)
                    eff_feather = min(feather, safe_feather_w, safe_feather_h)

                    if eff_feather < 1:
                        processed_roi.copyTo(gpu_roi)
                    else:
                        mask = np.zeros((bh, bw), dtype=np.float32)
                        cv2.rectangle(
                            mask,
                            (eff_feather, eff_feather),
                            (bw - eff_feather, bh - eff_feather),
                            1.0,
                            -1
                        )
                        mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
                        if mask_ksize_val % 2 == 0: mask_ksize_val += 1

                        mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)

                        gpu_mask = cv2.cuda_GpuMat()
                        gpu_mask.upload(mask)

                        gpu_mask_3ch = cv2.cuda_GpuMat()
                        cv2.cuda.merge([gpu_mask, gpu_mask, gpu_mask], gpu_mask_3ch)

                        gpu_roi_float = cv2.cuda_GpuMat()
                        gpu_blur_float = cv2.cuda_GpuMat()

                        gpu_roi.convertTo(cv2.CV_32FC3, gpu_roi_float)
                        processed_roi.convertTo(cv2.CV_32FC3, gpu_blur_float)

                        blended = cv2.cuda.multiply(gpu_blur_float, gpu_mask_3ch)

                        gpu_ones = cv2.cuda_GpuMat(gpu_mask_3ch.size(), gpu_mask_3ch.type(), (1.0, 1.0, 1.0, 0.0))
                        inverse_mask = cv2.cuda.subtract(gpu_ones, gpu_mask_3ch)

                        original_part = cv2.cuda.multiply(gpu_roi_float, inverse_mask)

                        final_float = cv2.cuda.add(blended, original_part)
                        final_float.convertTo(cv2.CV_8UC3, gpu_roi)
                else:
                    processed_roi.copyTo(gpu_roi)

                return gpu_frame.download()

            except cv2.error:
                pass

        roi_img = frame[by:by+bh, bx:bx+bw]

        k_size = sigma * 2 + 1
        processed_roi = cv2.boxFilter(roi_img, -1, (k_size, k_size))
        processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))
        processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))

        if feather > 0:
            safe_feather_w = int(bw * 0.45)
            safe_feather_h = int(bh * 0.45)
            eff_feather = min(feather, safe_feather_w, safe_feather_h)

            if eff_feather < 1:
                frame[by:by+bh, bx:bx+bw] = processed_roi
            else:
                mask = np.zeros((bh, bw), dtype=np.float32)
                cv2.rectangle(
                    mask,
                    (eff_feather, eff_feather),
                    (bw - eff_feather, bh - eff_feather),
                    1.0,
                    -1
                )
                mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
                if mask_ksize_val % 2 == 0: mask_ksize_val += 1

                mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)
                mask_3ch = cv2.merge([mask, mask, mask])

                roi_float = roi_img.astype(np.float32)
                blur_float = processed_roi.astype(np.float32)

                blended = blur_float * mask_3ch + roi_float * (1.0 - mask_3ch)
                frame[by:by+bh, bx:bx+bw] = blended.astype(np.uint8)
        else:
            frame[by:by+bh, bx:bx+bw] = processed_roi

        return frame

    def generate_preview(self, video_path: str, frame_index: int, settings: dict, text: str) -> Optional[np.ndarray]:
        """Generates a single preview frame with the obscuring filter applied using centralized robust extraction."""
        cached_frame = extract_frame_cv2(video_path, frame_index)
        if cached_frame is None:
            return None

        frame = cached_frame.copy()
        height, width = frame.shape[:2]

        roi = self._calculate_roi(text, width, height, settings)
        return self._apply_blur_to_frame(frame, roi, settings)

    def _run_subprocess_cancellable(self, cmd: list[str]) -> None:
        """Executes a subprocess and safely terminates it if the stop event is triggered."""
        process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        while process.poll() is None:
            if self._stop_event.is_set():
                process.terminate()
                try:
                    process.wait(timeout=2.0)
                except subprocess.TimeoutExpired:
                    process.kill()
                raise InterruptedError("Process was cancelled by user.")

            try:
                process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                continue

        if process.returncode != 0:
            raise subprocess.CalledProcessError(process.returncode, cmd)

    def apply_blur_task(
            self,
            video_path: str,
            subtitles: List[dict],
            blur_settings: dict,
            output_path: str,
            progress_callback=None
    ):
        """Executes the full video obscuring and accelerated hardware rendering pipeline with software fallback."""
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
            if not text: continue
            roi = self._calculate_roi(text, width, height, blur_settings)
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

        def reader_thread():
            try:
                frame_idx = 0
                while not task_stop.is_set() and not self._stop_event.is_set():
                    ret, frame = cap.read()
                    if not ret: break
                    read_queue.put((frame_idx, frame))
                    frame_idx += 1
                read_queue.put(None)
            except Exception as e:
                exception_queue.put(e)

        def processor_thread():
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
                        frame = self._apply_blur_to_frame(frame, frame_blur_map[idx], blur_settings)

                    write_queue.put(frame)

                    if progress_callback and idx % 25 == 0:
                        progress_callback(idx, total_frames)
            except Exception as e:
                exception_queue.put(e)

        def writer_thread():
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
                t_write.join(timeout=0.5)
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

            while not read_queue.empty(): read_queue.get_nowait()
            while not write_queue.empty(): write_queue.get_nowait()

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
                    self._run_subprocess_cancellable(cmd_nvenc_copy)
                except subprocess.CalledProcessError:
                    try:
                        logger.warning("NVENC audio copy failed, falling back to AAC with NVENC...")
                        cmd_nvenc_aac = base_cmd + nvenc_params + ["-c:a", "aac", output_path]
                        self._run_subprocess_cancellable(cmd_nvenc_aac)
                    except subprocess.CalledProcessError:
                        logger.warning("NVENC encoding failed, falling back to software libx264...")
                        cmd_x264_aac = base_cmd + x264_params + ["-c:a", "aac", output_path]
                        self._run_subprocess_cancellable(cmd_x264_aac)

                if os.path.exists(temp_video_path):
                    os.remove(temp_video_path)
                return output_path
            except Exception as e:
                logger.error(f"FFmpeg failed or was interrupted: {e}")
                if os.path.exists(temp_video_path):
                    if os.path.exists(output_path): os.remove(output_path)
                    os.rename(temp_video_path, output_path)
                raise e
        else:
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
            raise InterruptedError("Render stopped by user")
