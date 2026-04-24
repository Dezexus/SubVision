"""
GPU utility functions for CUDA availability and data transfer.
"""
import cv2
import numpy as np


def has_cuda() -> bool:
    """
    Check if OpenCV CUDA module is available and devices are present.
    """
    try:
        return cv2.cuda.getCudaEnabledDeviceCount() > 0
    except AttributeError:
        return False


def ensure_gpu(frame):
    """
    Upload a numpy array to GPU memory if CUDA is available.
    """
    if not has_cuda() or frame is None:
        return frame
    try:
        gpu_mat = cv2.cuda_GpuMat()
        gpu_mat.upload(frame)
        return gpu_mat
    except cv2.error:
        return frame


def ensure_cpu(frame):
    """
    Download data from GPU memory back to a numpy array.
    """
    if not has_cuda():
        return frame
    try:
        if isinstance(frame, cv2.cuda_GpuMat):
            return frame.download()
        return frame
    except cv2.error:
        return frame