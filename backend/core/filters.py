"""
Module containing image filtering operations including denoising, scaling, and sharpening.
"""
import logging
from typing import Any
import cv2
import numpy as np

from core.constants import SHARPEN_KERNEL_NP, SHARPEN_KERNEL_LIST
from core.gpu_utils import has_cuda, ensure_gpu, ensure_cpu


def _apply_cpu_denoise(cpu_frame: np.ndarray, h_val: float) -> np.ndarray:
    return cv2.fastNlMeansDenoisingColored(cpu_frame, None, h_val, h_val, 7, 21)


def denoise_frame(frame: Any | None, strength: float) -> Any | None:
    if frame is None or strength <= 0:
        return frame
    h_val = float(strength)

    if has_cuda():
        try:
            gpu_mat = ensure_gpu(frame)
            denoised_gpu = cv2.cuda.fastNlMeansDenoisingColored(gpu_mat, h_val, h_val, 21, 7)
            if isinstance(frame, cv2.cuda_GpuMat):
                return denoised_gpu
            return denoised_gpu.download()
        except cv2.error:
            pass

    cpu_frame = ensure_cpu(frame)
    return _apply_cpu_denoise(cpu_frame, h_val)


def apply_scaling(frame: Any | None, scale_factor: float) -> Any | None:
    if frame is None:
        return None
    if scale_factor == 1.0:
        return frame

    if has_cuda():
        try:
            gpu_mat = ensure_gpu(frame)
            size = gpu_mat.size()
            new_size = (int(size[0] * scale_factor), int(size[1] * scale_factor))
            resized_gpu = cv2.cuda.resize(gpu_mat, new_size, interpolation=cv2.INTER_CUBIC)
            if isinstance(frame, cv2.cuda_GpuMat):
                return resized_gpu
            return resized_gpu.download()
        except cv2.error:
            pass

    cpu_frame = ensure_cpu(frame)
    return cv2.resize(cpu_frame, None, fx=scale_factor, fy=scale_factor, interpolation=cv2.INTER_CUBIC)


def apply_sharpening(frame: Any | None) -> Any | None:
    if frame is None:
        return None

    if has_cuda():
        try:
            gpu_mat = ensure_gpu(frame)
            filter_gpu = cv2.cuda.createLinearFilter(cv2.CV_8UC3, cv2.CV_8UC3, SHARPEN_KERNEL_NP)
            result_gpu = filter_gpu.apply(gpu_mat)
            if isinstance(frame, cv2.cuda_GpuMat):
                return result_gpu
            return result_gpu.download()
        except cv2.error:
            pass

    cpu_frame = ensure_cpu(frame)
    return cv2.filter2D(cpu_frame, -1, SHARPEN_KERNEL_NP)


def apply_scaling_paddle(tensor: Any, scale_factor: float) -> Any:
    import paddle
    import paddle.nn.functional as F

    if scale_factor == 1.0:
        return tensor
    x = tensor.transpose([2, 0, 1]).unsqueeze(0).astype('float32')
    out = F.interpolate(x, scale_factor=scale_factor, mode='bicubic', align_corners=False)
    out = paddle.clip(out, 0, 255).astype('uint8')
    return out.squeeze(0).transpose([1, 2, 0])


def apply_sharpening_paddle(tensor: Any) -> Any:
    import paddle
    import paddle.nn.functional as F

    k = paddle.to_tensor(SHARPEN_KERNEL_LIST, dtype='float32')
    k = k.unsqueeze(0).unsqueeze(0)
    weight = paddle.concat([k, k, k], axis=0)
    x = tensor.transpose([2, 0, 1]).unsqueeze(0).astype('float32')
    out = F.conv2d(x, weight, padding=1, groups=3)
    out = paddle.clip(out, 0, 255).astype('uint8')
    return out.squeeze(0).transpose([1, 2, 0])