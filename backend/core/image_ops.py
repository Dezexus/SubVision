import concurrent.futures
import functools
import subprocess
from typing import Any, Union
import cv2
import numpy as np
import logging

try:
    import paddle
    import paddle.nn.functional as F
    HAS_PADDLE = True
except ImportError:
    HAS_PADDLE = False

try:
    count = cv2.cuda.getCudaEnabledDeviceCount()
    HAS_CUDA = count > 0
except AttributeError:
    HAS_CUDA = False

if HAS_CUDA:
    try:
        FrameType = Union[np.ndarray, cv2.cuda.GpuMat]
    except AttributeError:
        FrameType = np.ndarray
        HAS_CUDA = False
else:
    FrameType = np.ndarray

_thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)

def ensure_gpu(frame: FrameType) -> Any:
    """Uploads frame to GPU if currently on CPU."""
    if not HAS_CUDA: return frame
    if type(frame).__name__ == "GpuMat": return frame
    try:
        gpu_mat = cv2.cuda_GpuMat()
        gpu_mat.upload(frame)
        return gpu_mat
    except cv2.error: return frame

def ensure_cpu(frame: FrameType) -> np.ndarray:
    """Downloads frame to CPU if currently on GPU."""
    if not HAS_CUDA: return frame
    if type(frame).__name__ == "GpuMat": return frame.download()
    return frame

def _apply_cpu_denoise(cpu_frame: np.ndarray, h_val: float) -> np.ndarray:
    """Isolated CPU denoise function for multithreading."""
    return cv2.fastNlMeansDenoisingColored(cpu_frame, None, h_val, h_val, 7, 21)

def denoise_frame(frame: FrameType | None, strength: float) -> FrameType | None:
    """Applies Fast Non-Local Means Denoising using GPU or multithreaded CPU fallback with timeout."""
    if frame is None or strength <= 0: return frame
    h_val = float(strength)

    if HAS_CUDA:
        try:
            gpu_mat = ensure_gpu(frame)
            denoised_gpu = cv2.cuda.fastNlMeansDenoisingColored(gpu_mat, h_val, h_val, 21, 7)
            if type(frame).__name__ == "GpuMat": return denoised_gpu
            return denoised_gpu.download()
        except cv2.error: pass

    cpu_frame = ensure_cpu(frame)
    future = _thread_pool.submit(_apply_cpu_denoise, cpu_frame, h_val)

    try:
        return future.result(timeout=30.0)
    except concurrent.futures.TimeoutError:
        logging.error("CPU Denoise thread hung, bypassing filter.")
        return cpu_frame

def apply_scaling(frame: FrameType | None, scale_factor: float) -> FrameType | None:
    """Resizes the frame using Bicubic interpolation."""
    if frame is None: return None
    if scale_factor == 1.0: return frame

    if HAS_CUDA:
        try:
            gpu_mat = ensure_gpu(frame)
            size = gpu_mat.size()
            new_size = (int(size[0] * scale_factor), int(size[1] * scale_factor))
            resized_gpu = cv2.cuda.resize(gpu_mat, new_size, interpolation=cv2.INTER_CUBIC)
            if type(frame).__name__ == "GpuMat": return resized_gpu
            return resized_gpu.download()
        except cv2.error: pass

    cpu_frame = ensure_cpu(frame)
    return cv2.resize(cpu_frame, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)

def apply_sharpening(frame: FrameType | None) -> FrameType | None:
    """Applies a sharpening filter kernel."""
    if frame is None: return None
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]], dtype=np.float32)

    if HAS_CUDA:
        try:
            gpu_mat = ensure_gpu(frame)
            filter_gpu = cv2.cuda.createLinearFilter(cv2.CV_8UC3, cv2.CV_8UC3, kernel)
            result_gpu = filter_gpu.apply(gpu_mat)
            if type(frame).__name__ == "GpuMat": return result_gpu
            return result_gpu.download()
        except cv2.error: pass

    cpu_frame = ensure_cpu(frame)
    return cv2.filter2D(cpu_frame, -1, kernel)

def apply_scaling_paddle(tensor: Any, scale_factor: float) -> Any:
    """Applies bicubic scaling directly on a Paddle GPU tensor."""
    if scale_factor == 1.0: return tensor
    x = tensor.transpose([2, 0, 1]).unsqueeze(0).astype('float32')
    out = F.interpolate(x, scale_factor=scale_factor, mode='bicubic', align_corners=False)
    out = paddle.clip(out, 0, 255).astype('uint8')
    return out.squeeze(0).transpose([1, 2, 0])

def apply_sharpening_paddle(tensor: Any) -> Any:
    """Applies sharpening convolution on a Paddle GPU tensor."""
    k = paddle.to_tensor([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]], dtype='float32')
    k = k.unsqueeze(0).unsqueeze(0)
    weight = paddle.concat([k, k, k], axis=0)
    x = tensor.transpose([2, 0, 1]).unsqueeze(0).astype('float32')
    out = F.conv2d(x, weight, padding=1, groups=3)
    out = paddle.clip(out, 0, 255).astype('uint8')
    return out.squeeze(0).transpose([1, 2, 0])

def detect_change_paddle(img1: Any, img2: Any) -> bool:
    """Performs GPU-based change detection using Paddle operations."""
    if not HAS_PADDLE or img1 is None or img2 is None: return True
    if img1.shape != img2.shape: return True
    try:
        f1 = img1.astype('float32')
        f2 = img2.astype('float32')
        g1 = paddle.mean(f1, axis=2, keepdim=True)
        g2 = paddle.mean(f2, axis=2, keepdim=True)
        g1 = g1.transpose([2, 0, 1]).unsqueeze(0)
        g2 = g2.transpose([2, 0, 1]).unsqueeze(0)
        b1 = F.avg_pool2d(g1, kernel_size=5, stride=1, padding=2)
        b2 = F.avg_pool2d(g2, kernel_size=5, stride=1, padding=2)
        diff = paddle.abs(b1 - b2)
        mask = diff > 15.0
        count = paddle.sum(mask.astype('int32'))
        return count.item() > 15
    except Exception: return True

def detect_change_absolute(img1: FrameType | None, img2: FrameType | None) -> bool:
    """Performs CPU/OpenCV-CUDA fallback change detection."""
    if img1 is None or img2 is None: return True
    size1 = img1.size() if type(img1).__name__ == "GpuMat" else (img1.shape[1], img1.shape[0])
    size2 = img2.size() if type(img2).__name__ == "GpuMat" else (img2.shape[1], img2.shape[0])
    if size1 != size2: return True

    if HAS_CUDA:
        try:
            gpu_1 = ensure_gpu(img1)
            gpu_2 = ensure_gpu(img2)
            g1 = cv2.cuda.cvtColor(gpu_1, cv2.COLOR_BGR2GRAY)
            g2 = cv2.cuda.cvtColor(gpu_2, cv2.COLOR_BGR2GRAY)
            filter_gauss = cv2.cuda.createGaussianFilter(cv2.CV_8UC1, cv2.CV_8UC1, (5, 5), 0)
            b1 = filter_gauss.apply(g1)
            b2 = filter_gauss.apply(g2)
            diff = cv2.cuda.absdiff(b1, b2)
            _, thresh = cv2.cuda.threshold(diff, 15, 255, cv2.THRESH_BINARY)
            count = cv2.cuda.countNonZero(thresh)
            return count > 15
        except cv2.error: pass

    c1 = ensure_cpu(img1)
    c2 = ensure_cpu(img2)
    g1 = cv2.cvtColor(c1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(c2, cv2.COLOR_BGR2GRAY)
    b1 = cv2.GaussianBlur(g1, (5, 5), 0)
    b2 = cv2.GaussianBlur(g2, (5, 5), 0)
    diff = cv2.absdiff(b1, b2)
    _, thresh = cv2.threshold(diff, 15, 255, cv2.THRESH_BINARY)
    count = cv2.countNonZero(thresh)
    return count > 15

@functools.lru_cache(maxsize=32)
def extract_frame_cv2(video_path: str, frame_index: int) -> np.ndarray | None:
    """Extracts a single frame using HW-accelerated capture with time-based and FFmpeg subprocess fallbacks."""
    if not video_path: return None

    def _try_read(cap_obj, idx, fps_val):
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

def calculate_roi_from_mask(image_dict: dict[str, Any] | None) -> list[int]:
    """Calculates ROI bounding box from a UI mask layer."""
    if not image_dict: return [0, 0, 0, 0]
    layers = image_dict.get("layers")
    if layers and len(layers) > 0:
        mask = layers[0]
        if isinstance(mask, np.ndarray) and mask.ndim == 3 and mask.shape[2] == 4:
            coords = cv2.findNonZero(mask[:, :, 3])
            if coords is not None:
                x, y, w, h = cv2.boundingRect(coords)
                return [int(x), int(y), int(w), int(h)]
    return [0, 0, 0, 0]
