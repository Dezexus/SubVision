from typing import Any
import cv2
import numpy as np
from core.gpu_utils import ensure_gpu, ensure_cpu, has_cuda
from core.constants import MOTION_BLUR_KSIZE, MOTION_MSE_THRESH

def detect_change_absolute(img1: Any, img2: Any) -> bool:
    """Detect visual changes between frames using Mean Squared Error."""
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
            gpu_1 = ensure_gpu(img1)
            gpu_2 = ensure_gpu(img2)
            g1 = cv2.cuda.cvtColor(gpu_1, cv2.COLOR_BGR2GRAY)
            g2 = cv2.cuda.cvtColor(gpu_2, cv2.COLOR_BGR2GRAY)
            filter_gauss = cv2.cuda.createGaussianFilter(cv2.CV_8UC1, cv2.CV_8UC1, MOTION_BLUR_KSIZE, 0)
            b1 = filter_gauss.apply(g1)
            b2 = filter_gauss.apply(g2)
            
            diff = cv2.cuda.absdiff(b1, b2)
            diff_f = cv2.cuda_GpuMat()
            diff.convertTo(cv2.CV_32FC1, diff_f)
            sq_diff = cv2.cuda.multiply(diff_f, diff_f)
            sum_sq = cv2.cuda.calcSum(sq_diff)[0]
            pixels = size1[0] * size1[1]
            mse = sum_sq / pixels if pixels > 0 else 0
            return mse > MOTION_MSE_THRESH
        except cv2.error:
            pass

    c1 = ensure_cpu(img1)
    c2 = ensure_cpu(img2)
    g1 = cv2.cvtColor(c1, cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(c2, cv2.COLOR_BGR2GRAY)
    b1 = cv2.GaussianBlur(g1, MOTION_BLUR_KSIZE, 0)
    b2 = cv2.GaussianBlur(g2, MOTION_BLUR_KSIZE, 0)
    
    diff = cv2.absdiff(b1, b2)
    diff_f = diff.astype(np.float32)
    sq_diff = diff_f ** 2
    mse = np.mean(sq_diff)
    return mse > MOTION_MSE_THRESH