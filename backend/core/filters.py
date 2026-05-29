from typing import Any
import cv2
from core.gpu_utils import has_cuda, ensure_gpu, ensure_cpu

def denoise_frame(frame: Any, strength: float) -> Any:
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
    return cv2.fastNlMeansDenoisingColored(cpu_frame, None, h_val, h_val, 7, 21)

def apply_scaling(frame: Any, scale_factor: float) -> Any:
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