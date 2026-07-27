import functools
import av
import cv2
import numpy as np
from typing import Optional, Tuple, Dict, Any, NamedTuple

class VideoInfo(NamedTuple):
    """Preliminary video metadata struct."""
    frame: Optional[np.ndarray]
    total_frames: int
    corrected_width: int

def get_video_dar(video_path: str) -> Optional[float]:
    """Calculate the Display Aspect Ratio using PyAV."""
    try:
        with av.open(video_path) as container:
            stream = container.streams.video[0]
            if stream.display_aspect_ratio:
                return float(stream.display_aspect_ratio)
            if stream.sample_aspect_ratio and stream.width and stream.height:
                return (stream.width / stream.height) * float(stream.sample_aspect_ratio)
            return None
    except Exception:
        return None

def get_video_metadata(video_path: str) -> Dict[str, Any]:
    """Retrieve essential video metadata using PyAV."""
    try:
        with av.open(video_path) as container:
            stream = container.streams.video[0]
            fps = float(stream.average_rate) if stream.average_rate else 25.0
            total_frames = stream.frames
            if total_frames <= 0:
                total_frames = int(float(stream.duration * stream.time_base) * fps)
            return {
                "width": stream.codec_context.width,
                "height": stream.codec_context.height,
                "fps": fps,
                "total_frames": total_frames
            }
    except Exception as e:
        raise RuntimeError(f"Metadata extraction failed: {e}")

def _correct_sar(frame: np.ndarray, src_width: int, src_height: int, dar: float) -> np.ndarray:
    """Adjust frame dimensions to match the display aspect ratio."""
    current_par = src_width / src_height
    if abs(current_par - dar) < 1e-3:
        return frame
    new_width = int(round(src_height * dar))
    if new_width == src_width:
        return frame
    return cv2.resize(frame, (new_width, src_height), interpolation=cv2.INTER_CUBIC)

@functools.lru_cache(maxsize=32)
def extract_frame_cv2(video_path: str, frame_index: int, dar: Optional[float] = None) -> Optional[Tuple[np.ndarray, int]]:
    """Extract a specific frame using sequential decoding and PTS tracking."""
    if not video_path:
        return None
    try:
        with av.open(video_path) as container:
            stream = container.streams.video[0]
            fps = float(stream.average_rate) if stream.average_rate else 25.0
            target_timestamp = int((frame_index / fps) / stream.time_base)
            container.seek(target_timestamp, stream=stream, backward=True)
            
            first = True
            current_idx = 0
            for frame in container.decode(stream):
                if first:
                    if frame.pts is not None:
                        current_idx = int(round((frame.pts * float(stream.time_base)) * fps))
                    else:
                        current_idx = 0
                    first = False
                
                if current_idx >= frame_index:
                    img = frame.to_ndarray(format='bgr24')
                    h, w = img.shape[:2]
                    if dar is None:
                        dar = get_video_dar(video_path)
                    if dar is not None and abs(dar - (w / h)) > 1e-3:
                        img = _correct_sar(img, w, h, dar)
                        return img, int(round(h * dar))
                    return img, w
                current_idx += 1
    except Exception:
        pass
    return None

def iter_frames(video_path: str, step: int = 1, fps: float = 25.0, total: int = 0, width: int = 0, height: int = 0, use_hwaccel: bool = True):
    """Yield video frames sequentially using PyAV."""
    with av.open(video_path) as container:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        frame_idx = 0
        for frame in container.decode(stream):
            if frame_idx % step == 0:
                img = frame.to_ndarray(format='bgr24')
                timestamp = frame_idx / fps
                yield frame_idx, timestamp, img
            frame_idx += 1

def get_video_info(video_path: str) -> VideoInfo:
    """Get preliminary video metadata and the first frame."""
    if not video_path:
        return VideoInfo(None, 1, 0)
    dar = get_video_dar(video_path)
    result = extract_frame_cv2(video_path, 0, dar=dar)
    if result is None:
        return VideoInfo(None, 1, 0)
    frame, corrected_width = result
    meta = get_video_metadata(video_path)
    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB) if frame is not None else None
    return VideoInfo(frame_rgb, meta["total_frames"], corrected_width)

def get_frame_image(video_path: str, frame_index: int) -> np.ndarray | None:
    """Retrieve a single frame as an RGB numpy array."""
    dar = get_video_dar(video_path)
    result = extract_frame_cv2(video_path, frame_index, dar=dar)
    if result is None:
        return None
    frame, _ = result
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

def generate_video_preview(video_path: str, frame_index: int, roi_override: list[int] | None, scale_factor: float) -> np.ndarray | None:
    """Generate a processed preview image applying ROI and filters."""
    if not video_path:
        return None
    dar = get_video_dar(video_path)
    result = extract_frame_cv2(video_path, frame_index, dar=dar)
    if result is None:
        return None
    frame_bgr, corrected_width = result
    original_height = frame_bgr.shape[0]
    if roi_override and len(roi_override) == 4 and roi_override[2] > 0 and roi_override[3] > 0:
        x, y, w, h = roi_override
        scale_x = corrected_width / frame_bgr.shape[1]
        x_corr = int(round(x * scale_x))
        w_corr = int(round(w * scale_x))
        y_corr = y
        h_corr = h
        x_corr = max(0, min(x_corr, corrected_width - 1))
        y_corr = max(0, min(y_corr, original_height - 1))
        w_corr = min(w_corr, corrected_width - x_corr)
        h_corr = min(h_corr, original_height - y_corr)
        if w_corr > 0 and h_corr > 0:
            frame_roi = frame_bgr[y_corr:y_corr + h_corr, x_corr:x_corr + w_corr]
        else:
            frame_roi = frame_bgr
    else:
        frame_roi = frame_bgr
    if frame_roi.size == 0:
        return None
    denoised = cv2.cuda.fastNlMeansDenoisingColored(frame_roi, None, 3.0, 3.0, 7, 21) if cv2.cuda.getCudaEnabledDeviceCount() > 0 else cv2.fastNlMeansDenoisingColored(frame_roi, None, 3.0, 3.0, 7, 21)
    processed = denoised
    if scale_factor > 1.0 and processed is not None:
        processed = cv2.resize(processed, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)
    return processed