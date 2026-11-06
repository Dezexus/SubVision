from typing import Any
import cv2
from subvision.core.gpu_utils import has_cuda, ensure_gpu, ensure_cpu


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
