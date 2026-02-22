"""
Module containing image filtering operations including denoising, scaling, and sharpening.
"""
import concurrent.futures
import logging
from typing import Any, Union, Optional
import cv2
import numpy as np

from core.constants import SHARPEN_KERNEL_NP, SHARPEN_KERNEL_LIST

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

def ensure_gpu(frame: FrameType) -> Any:
    """
    Uploads frame to GPU if currently on CPU.
    """
    if not HAS_CUDA:
        return frame
    if type(frame).__name__ == "GpuMat":
        return frame
    try:
        gpu_mat = cv2.cuda_GpuMat()
        gpu_mat.upload(frame)
        return gpu_mat
    except cv2.error:
        return frame

def ensure_cpu(frame: FrameType) -> np.ndarray:
    """
    Downloads frame to CPU if currently on GPU.
    """
    if not HAS_CUDA:
        return frame
    if type(frame).__name__ == "GpuMat":
        return frame.download()
    return frame

def _apply_cpu_denoise(cpu_frame: np.ndarray, h_val: float) -> np.ndarray:
    """
    Isolated CPU denoise function for multithreading.
    """
    return cv2.fastNlMeansDenoisingColored(cpu_frame, None, h_val, h_val, 7, 21)

def denoise_frame(frame: FrameType | None, strength: float, thread_pool: Optional[concurrent.futures.ThreadPoolExecutor] = None) -> FrameType | None:
    """
    Applies Fast Non-Local Means Denoising using GPU or multithreaded CPU fallback.
    """
    if frame is None or strength <= 0:
        return frame
    h_val = float(strength)

    if HAS_CUDA:
        try:
            gpu_mat = ensure_gpu(frame)
            denoised_gpu = cv2.cuda.fastNlMeansDenoisingColored(gpu_mat, h_val, h_val, 21, 7)
            if type(frame).__name__ == "GpuMat":
                return denoised_gpu
            return denoised_gpu.download()
        except cv2.error:
            pass

    cpu_frame = ensure_cpu(frame)

    local_pool = thread_pool or concurrent.futures.ThreadPoolExecutor(max_workers=1)
    future = local_pool.submit(_apply_cpu_denoise, cpu_frame, h_val)

    try:
        result = future.result(timeout=30.0)
    except concurrent.futures.TimeoutError:
        logging.error("CPU Denoise thread hung, bypassing filter.")
        result = cpu_frame
    finally:
        if thread_pool is None:
            local_pool.shutdown(wait=False)

    return result

def apply_scaling(frame: FrameType | None, scale_factor: float) -> FrameType | None:
    """
    Resizes the frame using Bicubic interpolation.
    """
    if frame is None:
        return None
    if scale_factor == 1.0:
        return frame

    if HAS_CUDA:
        try:
            gpu_mat = ensure_gpu(frame)
            size = gpu_mat.size()
            new_size = (int(size[0] * scale_factor), int(size[1] * scale_factor))
            resized_gpu = cv2.cuda.resize(gpu_mat, new_size, interpolation=cv2.INTER_CUBIC)
            if type(frame).__name__ == "GpuMat":
                return resized_gpu
            return resized_gpu.download()
        except cv2.error:
            pass

    cpu_frame = ensure_cpu(frame)
    return cv2.resize(cpu_frame, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)

def apply_sharpening(frame: FrameType | None) -> FrameType | None:
    """
    Applies a sharpening filter kernel.
    """
    if frame is None:
        return None

    if HAS_CUDA:
        try:
            gpu_mat = ensure_gpu(frame)
            filter_gpu = cv2.cuda.createLinearFilter(cv2.CV_8UC3, cv2.CV_8UC3, SHARPEN_KERNEL_NP)
            result_gpu = filter_gpu.apply(gpu_mat)
            if type(frame).__name__ == "GpuMat":
                return result_gpu
            return result_gpu.download()
        except cv2.error:
            pass

    cpu_frame = ensure_cpu(frame)
    return cv2.filter2D(cpu_frame, -1, SHARPEN_KERNEL_NP)

def apply_scaling_paddle(tensor: Any, scale_factor: float) -> Any:
    """
    Applies bicubic scaling directly on a Paddle GPU tensor.
    """
    if scale_factor == 1.0:
        return tensor
    x = tensor.transpose([2, 0, 1]).unsqueeze(0).astype('float32')
    out = F.interpolate(x, scale_factor=scale_factor, mode='bicubic', align_corners=False)
    out = paddle.clip(out, 0, 255).astype('uint8')
    return out.squeeze(0).transpose([1, 2, 0])

def apply_sharpening_paddle(tensor: Any) -> Any:
    """
    Applies sharpening convolution on a Paddle GPU tensor.
    """
    k = paddle.to_tensor(SHARPEN_KERNEL_LIST, dtype='float32')
    k = k.unsqueeze(0).unsqueeze(0)
    weight = paddle.concat([k, k, k], axis=0)
    x = tensor.transpose([2, 0, 1]).unsqueeze(0).astype('float32')
    out = F.conv2d(x, weight, padding=1, groups=3)
    out = paddle.clip(out, 0, 255).astype('uint8')
    return out.squeeze(0).transpose([1, 2, 0])
