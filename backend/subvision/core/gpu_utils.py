import cv2


def has_cuda() -> bool:
    try:
        return cv2.cuda.getCudaEnabledDeviceCount() > 0
    except AttributeError:
        return False


def release_paddle_gpu_memory() -> None:
    """Release Paddle GPU cache before render tasks that use LaMa ONNX."""
    try:
        import paddle

        if paddle.is_compiled_with_cuda():
            paddle.device.cuda.empty_cache()
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
