import cv2
import numpy as np

def has_cuda() -> bool:
    try:
        return cv2.cuda.getCudaEnabledDeviceCount() > 0
    except AttributeError:
        return False

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