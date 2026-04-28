"""
Motion and change detection algorithms for smart frame skipping.
"""
from typing import Any
import cv2
import numpy as np
from core.gpu_utils import ensure_gpu, ensure_cpu, has_cuda

HIST_CORRELATION_THRESHOLD = 0.95


def detect_change_absolute(img1: Any, img2: Any) -> bool:
    """Return True if the two images differ significantly based on histogram correlation."""
    if img1 is None or img2 is None:
        return True

    try:
        size1 = img1.shape[1], img1.shape[0]
        size2 = img2.shape[1], img2.shape[0]
    except AttributeError:
        try:
            size1 = img1.size()
            size2 = img2.size()
        except Exception:
            return True

    if size1 != size2:
        return True

    if has_cuda():
        try:
            gpu1 = ensure_gpu(img1)
            gpu2 = ensure_gpu(img2)
            gray1 = cv2.cuda.cvtColor(gpu1, cv2.COLOR_BGR2GRAY) if gpu1.channels() == 3 else gpu1
            gray2 = cv2.cuda.cvtColor(gpu2, cv2.COLOR_BGR2GRAY) if gpu2.channels() == 3 else gpu2
            hist1 = cv2.cuda.calcHist(gray1, [0], None, [256], [0, 256])
            hist2 = cv2.cuda.calcHist(gray2, [0], None, [256], [0, 256])
            cv2.normalize(hist1, hist1)
            cv2.normalize(hist2, hist2)
            correlation = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
            return correlation < HIST_CORRELATION_THRESHOLD
        except cv2.error:
            pass

    c1 = ensure_cpu(img1)
    c2 = ensure_cpu(img2)
    gray1 = cv2.cvtColor(c1, cv2.COLOR_BGR2GRAY) if len(c1.shape) == 3 else c1
    gray2 = cv2.cvtColor(c2, cv2.COLOR_BGR2GRAY) if len(c2.shape) == 3 else c2
    hist1 = cv2.calcHist([gray1], [0], None, [256], [0, 256])
    hist2 = cv2.calcHist([gray2], [0], None, [256], [0, 256])
    cv2.normalize(hist1, hist1)
    cv2.normalize(hist2, hist2)
    correlation = cv2.compareHist(hist1, hist2, cv2.HISTCMP_CORREL)
    return correlation < HIST_CORRELATION_THRESHOLD