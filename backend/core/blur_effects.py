"""
Module providing text obscuring effects combining targeted mask inpainting with regional box blurring and unified alpha blending.
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
    Applies text-aware inpainting using a low-threshold gradient to capture drop-shadows, processed via Navier-Stokes for a structurally smooth background reconstruction.
    """
    bx, by, bw, bh = roi
    pad = max(15, int(font_size_px * 0.5))
    h, w = frame.shape[:2]

    y1 = max(0, by - pad)
    y2 = min(h, by + bh + pad)
    x1 = max(0, bx - pad)
    x2 = min(w, bx + bw + pad)

    roi_expanded = frame[y1:y2, x1:x2].copy()
    roi_inner = frame[by:by+bh, bx:bx+bw]

    gray = cv2.cvtColor(roi_inner, cv2.COLOR_BGR2GRAY)

    grad_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, grad_kernel)

    _, text_mask = cv2.threshold(grad, 25, 255, cv2.THRESH_BINARY)

    fill_ksize = max(5, int(font_size_px * 0.5))
    fill_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (fill_ksize, fill_ksize))
    text_mask = cv2.morphologyEx(text_mask, cv2.MORPH_CLOSE, fill_kernel)

    dilate_ksize = max(9, int(font_size_px * 0.6))
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_ksize, dilate_ksize))
    text_mask = cv2.dilate(text_mask, dilate_kernel, iterations=1)

    local_mask = np.zeros(roi_expanded.shape[:2], dtype=np.uint8)

    ly1 = by - y1
    ly2 = ly1 + bh
    lx1 = bx - x1
    lx2 = lx1 + bw

    local_mask[ly1:ly2, lx1:lx2] = text_mask

    inpaint_radius = max(5, int(font_size_px * 0.3))
    inpainted = cv2.inpaint(roi_expanded, local_mask, inpaint_radius, cv2.INPAINT_NS)

    smooth_k = max(11, int(font_size_px * 0.8))
    if smooth_k % 2 == 0:
        smooth_k += 1
    inpainted_smooth = cv2.GaussianBlur(inpainted, (smooth_k, smooth_k), 0)

    blend_k = max(9, int(font_size_px * 0.6))
    if blend_k % 2 == 0:
        blend_k += 1

    soft_mask = cv2.GaussianBlur(local_mask, (blend_k, blend_k), 0).astype(np.float32) / 255.0
    soft_mask_3ch = cv2.merge([soft_mask, soft_mask, soft_mask])

    inpainted_float = inpainted_smooth.astype(np.float32)
    original_float = roi_expanded.astype(np.float32)

    blended = inpainted_float * soft_mask_3ch + original_float * (1.0 - soft_mask_3ch)
    frame[y1:y2, x1:x2] = blended.astype(np.uint8)

def _apply_cuda_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], original_roi: np.ndarray, sigma: int, feather: int, alpha: float) -> np.ndarray:
    """
    Applies hardware-accelerated 3-pass box blur to the region and blends it with the original frame.
    """
    bx, by, bw, bh = roi
    h, w = frame.shape[:2]
    gpu_frame = cv2.cuda_GpuMat()
    gpu_frame.upload(frame)

    gpu_roi = cv2.cuda_GpuMat(gpu_frame, (bx, by, bw, bh))

    if sigma > 0:
        k_size = sigma * 2 + 1
        box_filter = cv2.cuda.createBoxFilter(gpu_roi.type(), -1, (k_size, k_size))
        processed_roi = box_filter.apply(gpu_roi)
        processed_roi = box_filter.apply(processed_roi)
        processed_roi = box_filter.apply(processed_roi)
    else:
        processed_roi = gpu_roi.clone()

    if feather > 0 or alpha < 1.0:
        safe_feather_w = int(bw * 0.45)
        safe_feather_h = int(bh * 0.45)
        eff_feather = min(feather, safe_feather_w, safe_feather_h)

        if eff_feather < 1:
            mask = np.ones((bh, bw), dtype=np.float32)
        else:
            mask = np.zeros((bh, bw), dtype=np.float32)

            pt1_x = eff_feather if bx > 0 else 0
            pt1_y = eff_feather if by > 0 else 0
            pt2_x = bw - eff_feather if (bx + bw) < w else bw
            pt2_y = bh - eff_feather if (by + bh) < h else bh

            cv2.rectangle(
                mask,
                (pt1_x, pt1_y),
                (pt2_x, pt2_y),
                1.0,
                -1
            )
            mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
            if mask_ksize_val % 2 == 0:
                mask_ksize_val += 1
            mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)

        mask *= alpha

        gpu_mask = cv2.cuda_GpuMat()
        gpu_mask.upload(mask)

        gpu_mask_3ch = cv2.cuda_GpuMat()
        cv2.cuda.merge([gpu_mask, gpu_mask, gpu_mask], gpu_mask_3ch)

        gpu_original_roi = cv2.cuda_GpuMat()
        gpu_original_roi.upload(original_roi)

        gpu_original_float = cv2.cuda_GpuMat()
        gpu_blur_float = cv2.cuda_GpuMat()

        gpu_original_roi.convertTo(cv2.CV_32FC3, gpu_original_float)
        processed_roi.convertTo(cv2.CV_32FC3, gpu_blur_float)

        blended = cv2.cuda.multiply(gpu_blur_float, gpu_mask_3ch)

        gpu_ones = cv2.cuda_GpuMat(gpu_mask_3ch.size(), gpu_mask_3ch.type(), (1.0, 1.0, 1.0, 0.0))
        inverse_mask = cv2.cuda.subtract(gpu_ones, gpu_mask_3ch)

        original_part = cv2.cuda.multiply(gpu_original_float, inverse_mask)

        final_float = cv2.cuda.add(blended, original_part)
        final_float.convertTo(cv2.CV_8UC3, gpu_roi)
    else:
        processed_roi.copyTo(gpu_roi)

    return gpu_frame.download()

def _apply_cpu_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], original_roi: np.ndarray, sigma: int, feather: int, alpha: float) -> np.ndarray:
    """
    Applies software-based 3-pass box blur to the region and blends it with the original frame.
    """
    bx, by, bw, bh = roi
    h, w = frame.shape[:2]
    roi_img = frame[by:by+bh, bx:bx+bw]

    if sigma > 0:
        k_size = sigma * 2 + 1
        processed_roi = cv2.boxFilter(roi_img, -1, (k_size, k_size))
        processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))
        processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))
    else:
        processed_roi = roi_img.copy()

    if feather > 0 or alpha < 1.0:
        safe_feather_w = int(bw * 0.45)
        safe_feather_h = int(bh * 0.45)
        eff_feather = min(feather, safe_feather_w, safe_feather_h)

        if eff_feather < 1:
            mask = np.ones((bh, bw), dtype=np.float32)
        else:
            mask = np.zeros((bh, bw), dtype=np.float32)

            pt1_x = eff_feather if bx > 0 else 0
            pt1_y = eff_feather if by > 0 else 0
            pt2_x = bw - eff_feather if (bx + bw) < w else bw
            pt2_y = bh - eff_feather if (by + bh) < h else bh

            cv2.rectangle(
                mask,
                (pt1_x, pt1_y),
                (pt2_x, pt2_y),
                1.0,
                -1
            )
            mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
            if mask_ksize_val % 2 == 0:
                mask_ksize_val += 1
            mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)

        mask_3ch = cv2.merge([mask, mask, mask])
        alpha_mask = mask_3ch * alpha

        original_float = original_roi.astype(np.float32)
        blur_float = processed_roi.astype(np.float32)

        blended = blur_float * alpha_mask + original_float * (1.0 - alpha_mask)
        frame[by:by+bh, bx:bx+bw] = blended.astype(np.uint8)
    else:
        frame[by:by+bh, bx:bx+bw] = processed_roi

    return frame

def apply_blur_to_frame(frame: np.ndarray, roi: Tuple[int, int, int, int], settings: Dict[str, Any], alpha: float = 1.0) -> np.ndarray:
    """
    Coordinates the execution sequence of inpainting, blurring, and final compositing based on user settings.
    """
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0 or alpha <= 0.0:
        return frame

    original_roi = frame[by:by+bh, bx:bx+bw].copy()

    mode = settings.get('mode', 'hybrid')
    if mode == 'hybrid':
        font_size_px = int(settings.get('font_size', 21))
        _apply_hybrid_inpaint(frame, roi, font_size_px)

    sigma = int(settings.get('sigma', 5))
    feather = int(settings.get('feather', 30))

    if HAS_CUDA:
        try:
            return _apply_cuda_blur(frame, roi, original_roi, sigma, feather, alpha)
        except cv2.error:
            pass

    return _apply_cpu_blur(frame, roi, original_roi, sigma, feather, alpha)
