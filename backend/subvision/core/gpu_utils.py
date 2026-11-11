import logging

import cv2

logger = logging.getLogger(__name__)
_reported_fallbacks: set[str] = set()


def has_cuda() -> bool:
    try:
        return cv2.cuda.getCudaEnabledDeviceCount() > 0
    except AttributeError:
        return False


def warn_cpu_fallback(operation: str) -> None:
    """Log, once per operation, that a CUDA path failed and CPU is used instead.

    Call from inside an ``except`` block. A broken CUDA path otherwise only
    shows up as slow processing.
    """
    if operation in _reported_fallbacks:
        return
    _reported_fallbacks.add(operation)
    logger.warning("CUDA %s failed, falling back to CPU", operation, exc_info=True)


def release_paddle_gpu_memory() -> None:
    """Release cached ML allocations before rendering with OpenCV CUDA."""
    try:
        import paddle

        if paddle.is_compiled_with_cuda():
            paddle.device.cuda.empty_cache()
    except Exception:
        pass
    try:
        import gc

        gc.collect()
    except Exception:
        pass
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            torch.cuda.ipc_collect()
    except Exception:
        pass


def ensure_gpu(frame):
    if not has_cuda() or frame is None:
        return frame
    try:
        gpu_mat = cv2.cuda_GpuMat()
        gpu_mat.upload(frame)
        return gpu_mat
    except cv2.error:
        return frame


def ensure_cpu(frame):
    if not has_cuda():
        return frame
    try:
        if isinstance(frame, cv2.cuda_GpuMat):
            return frame.download()
        return frame
    except cv2.error:
        return frame
