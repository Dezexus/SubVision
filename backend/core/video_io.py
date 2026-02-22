"""
Module for extracting frames from video streams robustly.
"""
import functools
import logging
import subprocess
import cv2
import numpy as np

@functools.lru_cache(maxsize=32)
def extract_frame_cv2(video_path: str, frame_index: int) -> np.ndarray | None:
    """
    Extracts a single frame using HW-accelerated capture with FFmpeg subprocess fallbacks.
    """
    if not video_path:
        return None

    def _try_read(cap_obj: cv2.VideoCapture, idx: int, fps_val: float) -> tuple[bool, np.ndarray | None]:
        cap_obj.set(cv2.CAP_PROP_POS_FRAMES, idx)
        success, frm = cap_obj.read()
        if not success and fps_val > 0:
            cap_obj.set(cv2.CAP_PROP_POS_MSEC, (idx / fps_val) * 1000.0)
            success, frm = cap_obj.read()
        return success, frm

    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_ANY])
    if not cap.isOpened():
        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])

    ok, frame = False, None
    fps = 25.0
    safe_index = frame_index

    if cap.isOpened():
        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            total = cap.get(cv2.CAP_PROP_FRAME_COUNT)

            if total > 0 and frame_index >= total:
                safe_index = int(total - 1)

            ok, frame = _try_read(cap, safe_index, fps)

            if not ok:
                cap.release()
                cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])
                if cap.isOpened():
                    ok, frame = _try_read(cap, safe_index, fps)
        finally:
            cap.release()

    if not ok or frame is None:
        try:
            timestamp = safe_index / fps if fps > 0 else safe_index / 25.0
            cmd = [
                "ffmpeg", "-y", "-ss", str(timestamp), "-i", video_path,
                "-frames:v", "1", "-f", "image2", "-vcodec", "mjpeg", "pipe:1"
            ]
            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5.0)
            if result.returncode == 0 and result.stdout:
                image_array = np.asarray(bytearray(result.stdout), dtype=np.uint8)
                decoded = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
                if decoded is not None:
                    frame = decoded
                    ok = True
        except Exception as e:
            logging.getLogger(__name__).warning(f"FFmpeg fallback failed: {e}")

    if ok and frame is not None:
        frame.setflags(write=False)
        return frame

    return None
