"""
Module providing motion and change detection algorithms for smart skipping.
"""
from typing import Any
import cv2
import numpy as np
from core.filters import ensure_gpu, ensure_cpu, FrameType, HAS_CUDA

try:
    import paddle
    import paddle.nn.functional as F
    HAS_PADDLE = True
except ImportError:
    HAS_PADDLE = False

def detect_change_paddle(img1: Any, img2: Any) -> bool:
    """
    Performs GPU-based change detection using Paddle operations.
    """
    if not HAS_PADDLE or img1 is None or img2 is None:
        return True
    if img1.shape != img2.shape:
        return True
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
    except Exception:
        return True

def detect_change_absolute(img1: FrameType | None, img2: FrameType | None) -> bool:
    """
    Performs CPU or OpenCV-CUDA fallback change detection.
    """
    if img1 is None or img2 is None:
        return True
    size1 = img1.size() if type(img1).__name__ == "GpuMat" else (img1.shape[1], img1.shape[0])
    size2 = img2.size() if type(img2).__name__ == "GpuMat" else (img2.shape[1], img2.shape[0])
    if size1 != size2:
        return True

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
        except cv2.error:
            pass

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
