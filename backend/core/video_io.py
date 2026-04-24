"""
Extracts frames and video metadata.
Provides caching for Display Aspect Ratio and codec detection.
"""
import functools
import logging
import subprocess
import json
from typing import Optional, Tuple, Dict, Any
import cv2
import numpy as np

_dar_cache: Dict[str, float] = {}
_codec_cache: Dict[str, str] = {}
HW_DISABLED_CODECS = frozenset({"av1", "vp9"})  # codecs without reliable hardware decoding


def get_video_codec(video_path: str) -> str:
    """Return the video codec name from the first video stream."""
    if video_path in _codec_cache:
        return _codec_cache[video_path]
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name",
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        streams = data.get("streams", [])
        codec = streams[0].get("codec_name", "unknown") if streams else "unknown"
        _codec_cache[video_path] = codec
        return codec
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to get codec for {video_path}: {e}")
        return "unknown"


def get_video_dar(video_path: str) -> Optional[float]:
    """Return Display Aspect Ratio, using cached value if available."""
    if video_path in _dar_cache:
        return _dar_cache[video_path]
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,sample_aspect_ratio",
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        stream = data.get("streams", [{}])[0]
        width = int(stream.get("width", 1))
        height = int(stream.get("height", 1))
        sar = stream.get("sample_aspect_ratio", "1:1")
        if sar == "N/A":
            sar = "1:1"
        sar_num, sar_den = map(int, sar.split(':'))
        dar = (width / height) * (sar_num / sar_den)
        _dar_cache[video_path] = dar
        return dar
    except Exception as e:
        logging.getLogger(__name__).warning(f"Failed to get DAR for {video_path}: {e}")
        return None


def create_video_capture(video_path: str) -> cv2.VideoCapture:
    codec = get_video_codec(video_path)
    if codec in HW_DISABLED_CODECS:
        cap = cv2.VideoCapture(video_path)
        ok, _ = cap.read()
        if not ok:
            cap.release()
            cap = cv2.VideoCapture(video_path)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        return cap

    cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_ANY])
    ok, _ = cap.read()

    if not ok:
        cap.release()
        cap = cv2.VideoCapture(video_path, cv2.CAP_FFMPEG, [cv2.CAP_PROP_HW_ACCELERATION, cv2.VIDEO_ACCELERATION_NONE])
        ok, _ = cap.read()

    if not ok:
        cap.release()
        cap = cv2.VideoCapture(video_path)
        cap.read()

    if cap.isOpened():
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

    return cap


def get_video_metadata(video_path: str) -> Dict[str, Any]:
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,r_frame_rate,nb_frames,duration",
        video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, check=True)
    data = json.loads(result.stdout)
    streams = data.get("streams", [])
    if not streams:
        raise RuntimeError("No video stream found")
    stream = streams[0]
    width = int(stream.get("width", 0))
    height = int(stream.get("height", 0))
    if width <= 0 or height <= 0:
        raise RuntimeError("Invalid video dimensions")

    r_frame_rate = stream.get("r_frame_rate", "25/1")
    num, den = r_frame_rate.split("/")
    fps = float(num) / float(den) if float(den) != 0 else 25.0

    nb_frames = stream.get("nb_frames")
    duration = stream.get("duration")
    if nb_frames and int(nb_frames) > 0:
        total_frames = int(nb_frames)
    elif duration:
        total_frames = int(float(duration) * fps)
    else:
        raise RuntimeError("Could not determine total frames")

    return {
        "width": width,
        "height": height,
        "fps": fps,
        "total_frames": total_frames
    }


def _correct_sar(frame: np.ndarray, src_width: int, src_height: int, dar: float) -> np.ndarray:
    current_par = src_width / src_height
    if abs(current_par - dar) < 1e-3:
        return frame
    new_width = int(round(src_height * dar))
    if new_width == src_width:
        return frame
    return cv2.resize(frame, (new_width, src_height), interpolation=cv2.INTER_CUBIC)


@functools.lru_cache(maxsize=32)
def extract_frame_cv2(video_path: str, frame_index: int, dar: Optional[float] = None) -> Optional[Tuple[np.ndarray, int]]:
    if not video_path:
        return None

    def _try_read(cap_obj, idx, fps_val):
        cap_obj.set(cv2.CAP_PROP_POS_FRAMES, idx)
        success, frm = cap_obj.read()
        if not success and fps_val > 0:
            cap_obj.set(cv2.CAP_PROP_POS_MSEC, (idx / fps_val) * 1000.0)
            success, frm = cap_obj.read()
        return success, frm

    cap = create_video_capture(video_path)

    ok, frame = False, None
    fps = 25.0
    safe_index = frame_index
    width, height = 0, 0

    if cap.isOpened():
        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            total = cap.get(cv2.CAP_PROP_FRAME_COUNT)
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            if total > 0 and frame_index >= total:
                safe_index = int(total - 1)

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
                    height, width = frame.shape[:2]
        except Exception as e:
            logging.getLogger(__name__).warning(f"FFmpeg fallback failed: {e}")

    if ok and frame is not None:
        if dar is None:
            dar = get_video_dar(video_path)
        if dar is not None and abs(dar - (width / height)) > 1e-3:
            frame = _correct_sar(frame, width, height, dar)
            new_width = int(round(height * dar))
            return frame, new_width
        return frame, width

    return None


def iter_frames_ffmpeg(video_path: str, step: int = 1, fps: float = 25.0, total: int = 0,
                        width: int = 0, height: int = 0,
                        use_hwaccel: bool = True):
    if total <= 0 or fps <= 0 or width <= 0 or height <= 0:
        raise RuntimeError("Invalid video metadata for ffmpeg pipe")

    cmd = ["ffmpeg"]
    if use_hwaccel:
        codec = get_video_codec(video_path)
        if codec not in HW_DISABLED_CODECS:
            cmd += ["-hwaccel", "auto"]
    cmd += [
        "-i", video_path,
        "-f", "rawvideo",
        "-pix_fmt", "bgr24",
        "-vsync", "0",
        "pipe:1"
    ]

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    frame_size = width * height * 3
    frame_idx = 0
    try:
        while proc.poll() is None:
            raw = proc.stdout.read(frame_size)
            if len(raw) != frame_size:
                break
            if frame_idx % step == 0:
                arr = np.frombuffer(raw, np.uint8).reshape((height, width, 3))
                timestamp = frame_idx / fps
                yield frame_idx, timestamp, arr.copy()
            frame_idx += 1
    finally:
        proc.kill()
        proc.wait()