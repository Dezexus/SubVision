"""
Module providing text obscuring effects like box blur and inpainting for video frames.
"""
from typing import Tuple, Dict, Any
import cv2
import numpy as np

try:
    count = cv2.cuda.getCudaEnabledDeviceCount()
    HAS_CUDA = count > 0
except AttributeError:
    HAS_CUDA = False

def _apply_hybrid_inpaint(frame: np.ndarray, roi: Tuple[int, int, int, int], font_size_px: int) -> None:
    """
    Applies text-aware inpainting to the specified region of interest.
    """
    bx, by, bw, bh = roi
    pad = 15
    h, w = frame.shape[:2]

    y1 = max(0, by - pad)
    y2 = min(h, by + bh + pad)
    x1 = max(0, bx - pad)
    x2 = min(w, bx + bw + pad)

    roi_expanded = frame[y1:y2, x1:x2]
    roi_inner = frame[by:by+bh, bx:bx+bw]

    gray = cv2.cvtColor(roi_inner, cv2.COLOR_BGR2GRAY)

    grad_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, grad_kernel)

    _, text_mask = cv2.threshold(grad, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)

    fill_ksize = max(3, int(font_size_px * 0.4))
    fill_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (fill_ksize, fill_ksize))
    text_mask = cv2.morphologyEx(text_mask, cv2.MORPH_CLOSE, fill_kernel)

    dilate_ksize = max(7, int(font_size_px * 0.4))
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_ksize, dilate_ksize))
    text_mask = cv2.dilate(text_mask, dilate_kernel, iterations=1)

    local_mask = np.zeros(roi_expanded.shape[:2], dtype=np.uint8)

    ly1 = by - y1
    ly2 = ly1 + bh
    lx1 = bx - x1
    lx2 = lx1 + bw

    local_mask[ly1:ly2, lx1:lx2] = text_mask

    inpainted = cv2.inpaint(roi_expanded, local_mask, 7, cv2.INPAINT_TELEA)
    frame[y1:y2, x1:x2] = inpainted

def _apply_cuda_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], sigma: int, feather: int) -> np.ndarray:
    """
    Applies hardware-accelerated box blur and blending using OpenCV CUDA.
    """
    bx, by, bw, bh = roi
    gpu_frame = cv2.cuda_GpuMat()
    gpu_frame.upload(frame)

    gpu_roi = cv2.cuda_GpuMat(gpu_frame, (bx, by, bw, bh))

    k_size = sigma * 2 + 1
    box_filter = cv2.cuda.createBoxFilter(gpu_roi.type(), -1, (k_size, k_size))

    processed_roi = box_filter.apply(gpu_roi)
    processed_roi = box_filter.apply(processed_roi)
    processed_roi = box_filter.apply(processed_roi)

    if feather > 0:
        safe_feather_w = int(bw * 0.45)
        safe_feather_h = int(bh * 0.45)
        eff_feather = min(feather, safe_feather_w, safe_feather_h)

        if eff_feather < 1:
            processed_roi.copyTo(gpu_roi)
        else:
            mask = np.zeros((bh, bw), dtype=np.float32)
            cv2.rectangle(
                mask,
                (eff_feather, eff_feather),
                (bw - eff_feather, bh - eff_feather),
                1.0,
                -1
            )
            mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
            if mask_ksize_val % 2 == 0:
                mask_ksize_val += 1

            mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)

            gpu_mask = cv2.cuda_GpuMat()
            gpu_mask.upload(mask)

            gpu_mask_3ch = cv2.cuda_GpuMat()
            cv2.cuda.merge([gpu_mask, gpu_mask, gpu_mask], gpu_mask_3ch)

            gpu_roi_float = cv2.cuda_GpuMat()
            gpu_blur_float = cv2.cuda_GpuMat()

            gpu_roi.convertTo(cv2.CV_32FC3, gpu_roi_float)
            processed_roi.convertTo(cv2.CV_32FC3, gpu_blur_float)

            blended = cv2.cuda.multiply(gpu_blur_float, gpu_mask_3ch)

            gpu_ones = cv2.cuda_GpuMat(gpu_mask_3ch.size(), gpu_mask_3ch.type(), (1.0, 1.0, 1.0, 0.0))
            inverse_mask = cv2.cuda.subtract(gpu_ones, gpu_mask_3ch)

            original_part = cv2.cuda.multiply(gpu_roi_float, inverse_mask)

            final_float = cv2.cuda.add(blended, original_part)
            final_float.convertTo(cv2.CV_8UC3, gpu_roi)
    else:
        processed_roi.copyTo(gpu_roi)

    return gpu_frame.download()

def _apply_cpu_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], sigma: int, feather: int) -> np.ndarray:
    """
    Applies software-based box blur and blending using OpenCV CPU operations.
    """
    bx, by, bw, bh = roi
    roi_img = frame[by:by+bh, bx:bx+bw]

    k_size = sigma * 2 + 1
    processed_roi = cv2.boxFilter(roi_img, -1, (k_size, k_size))
    processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))
    processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))

    if feather > 0:
        safe_feather_w = int(bw * 0.45)
        safe_feather_h = int(bh * 0.45)
        eff_feather = min(feather, safe_feather_w, safe_feather_h)

        if eff_feather < 1:
            frame[by:by+bh, bx:bx+bw] = processed_roi
        else:
            mask = np.zeros((bh, bw), dtype=np.float32)
            cv2.rectangle(
                mask,
                (eff_feather, eff_feather),
                (bw - eff_feather, bh - eff_feather),
                1.0,
                -1
            )
            mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
            if mask_ksize_val % 2 == 0:
                mask_ksize_val += 1

            mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)
            mask_3ch = cv2.merge([mask, mask, mask])

            roi_float = roi_img.astype(np.float32)
            blur_float = processed_roi.astype(np.float32)

            blended = blur_float * mask_3ch + roi_float * (1.0 - mask_3ch)
            frame[by:by+bh, bx:bx+bw] = blended.astype(np.uint8)
    else:
        frame[by:by+bh, bx:bx+bw] = processed_roi

    return frame

def apply_blur_to_frame(frame: np.ndarray, roi: Tuple[int, int, int, int], settings: Dict[str, Any]) -> np.ndarray:
    """
    Applies specified obscuring method to a frame ROI.
    """
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0:
        return frame

    mode = settings.get('mode', 'hybrid')
    font_size_px = int(settings.get('font_size', 21))

    if mode == 'hybrid':
        _apply_hybrid_inpaint(frame, roi, font_size_px)

    sigma = int(settings.get('sigma', 5))
    feather = int(settings.get('feather', 30))

    if HAS_CUDA:
        try:
            return _apply_cuda_blur(frame, roi, sigma, feather)
        except cv2.error:
            pass

    return _apply_cpu_blur(frame, roi, sigma, feather)
