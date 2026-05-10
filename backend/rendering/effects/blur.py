import logging
from typing import Tuple, Dict, Any, Optional, List
import functools
import cv2
import numpy as np
from core.gpu_utils import has_cuda
from rendering.geometry import calculate_blur_roi, calculate_text_roi

logger = logging.getLogger(__name__)

@functools.lru_cache(maxsize=256)
def _get_cached_mask(bw: int, bh: int, bx: int, by: int, w: int, h: int, eff_feather: int, inner_roi: Optional[Tuple[int, int, int, int]]) -> np.ndarray:
    """Generate and cache the feather mask to avoid redundant GaussianBlur calculations."""
    if eff_feather < 1:
        return np.ones((bh, bw), dtype=np.float32)

    mask = np.zeros((bh, bw), dtype=np.float32)

    if inner_roi is not None:
        ix, iy, iw, ih = inner_roi
        rx, ry = max(0, ix - bx), max(0, iy - by)

        pt1_x = max(0, rx - (eff_feather // 2))
        pt1_y = max(0, ry - (eff_feather // 2))
        pt2_x = min(bw, rx + iw + (eff_feather // 2))
        pt2_y = min(bh, ry + ih + (eff_feather // 2))
    else:
        pt1_x = eff_feather if bx > 0 else 0
        pt1_y = eff_feather if by > 0 else 0
        pt2_x = bw - eff_feather if (bx + bw) < w else bw
        pt2_y = bh - eff_feather if (by + bh) < h else bh

    cv2.rectangle(mask, (pt1_x, pt1_y), (pt2_x, pt2_y), 1.0, -1)

    mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
    if mask_ksize_val % 2 == 0:
        mask_ksize_val += 1
    
    return cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)

def _apply_cuda_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], original_roi: np.ndarray, sigma: int, feather: int, alpha: float, inner_roi: Optional[Tuple[int, int, int, int]] = None) -> np.ndarray:
    """Apply GPU-accelerated box blur with cached masking."""
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

        base_mask = _get_cached_mask(bw, bh, bx, by, w, h, eff_feather, inner_roi)
        mask = base_mask * alpha

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

def _apply_cpu_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], original_roi: np.ndarray, sigma: int, feather: int, alpha: float, inner_roi: Optional[Tuple[int, int, int, int]] = None) -> np.ndarray:
    """Apply CPU-based box blur with cached masking and downscale optimization."""
    bx, by, bw, bh = roi
    h, w = frame.shape[:2]
    roi_img = frame[by:by+bh, bx:bx+bw]

    if sigma > 0:
        k_size = sigma * 2 + 1
        if bw > 300 and bh > 100 and sigma > 3:
            scale = 0.5
            small_roi = cv2.resize(roi_img, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
            small_k = max(3, int(k_size * scale))
            if small_k % 2 == 0:
                small_k += 1
            
            processed_roi = cv2.boxFilter(small_roi, -1, (small_k, small_k))
            processed_roi = cv2.boxFilter(processed_roi, -1, (small_k, small_k))
            processed_roi = cv2.boxFilter(processed_roi, -1, (small_k, small_k))
            
            processed_roi = cv2.resize(processed_roi, (bw, bh), interpolation=cv2.INTER_LINEAR)
        else:
            processed_roi = cv2.boxFilter(roi_img, -1, (k_size, k_size))
            processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))
            processed_roi = cv2.boxFilter(processed_roi, -1, (k_size, k_size))
    else:
        processed_roi = roi_img.copy()

    if feather > 0 or alpha < 1.0:
        safe_feather_w = int(bw * 0.45)
        safe_feather_h = int(bh * 0.45)
        eff_feather = min(feather, safe_feather_w, safe_feather_h)

        base_mask = _get_cached_mask(bw, bh, bx, by, w, h, eff_feather, inner_roi)
        mask = base_mask * alpha

        mask_3ch = cv2.merge([mask, mask, mask])

        original_float = original_roi.astype(np.float32)
        blur_float = processed_roi.astype(np.float32)

        blended = blur_float * mask_3ch + original_float * (1.0 - mask_3ch)
        frame[by:by+bh, bx:bx+bw] = blended.astype(np.uint8)
    else:
        frame[by:by+bh, bx:bx+bw] = processed_roi

    return frame

def apply_blur_to_frame(frame: np.ndarray, roi: Tuple[int, int, int, int], settings: Dict[str, Any], alpha: float = 1.0, inner_roi: Optional[Tuple[int, int, int, int]] = None) -> np.ndarray:
    """Entry point for applying blur."""
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0 or alpha <= 0.0:
        return frame

    original_roi = frame[by:by+bh, bx:bx+bw].copy()

    sigma = int(settings.get('sigma', 5))
    feather = int(settings.get('feather', 30))

    if has_cuda():
        try:
            return _apply_cuda_blur(frame, roi, original_roi, sigma, feather, alpha, inner_roi)
        except cv2.error:
            pass

    return _apply_cpu_blur(frame, roi, original_roi, sigma, feather, alpha, inner_roi)

class BlurEffect:
    """Applies temporal blur regions across frames."""
    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.frame_blur_map: Dict[int, List[Tuple[Tuple[int, int, int, int], Tuple[int, int, int, int]]]] = {}

    async def prepare(
        self,
        subtitles: list[dict[str, Any]],
        width: int,
        height: int,
        fps: float,
        total_frames: int,
        video_path: str,
    ) -> None:
        """Pre-calculate blur zones."""
        self.frame_blur_map.clear()
        blur_dict = self.blur_settings
        roi_count = 0
        for sub in subtitles:
            text = sub.get('text', '').strip()
            if not text:
                continue
            blur_roi = calculate_blur_roi(text, width, height, blur_dict)
            text_roi = calculate_text_roi(text, width, height, blur_dict)
            start_f = max(0, int(sub['start'] * fps) - 1)
            end_f = min(total_frames + 5, int(sub['end'] * fps) + 1)
            for f_idx in range(start_f, end_f):
                if f_idx not in self.frame_blur_map:
                    self.frame_blur_map[f_idx] = []
                self.frame_blur_map[f_idx].append((blur_roi, text_roi))
                roi_count += 1
        logger.info("BlurEffect prepared: %d frame-region entries", roi_count)

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        """Apply effects for the given frame index."""
        if frame_index not in self.frame_blur_map:
            return frame

        for blur_roi, text_roi in self.frame_blur_map[frame_index]:
            frame = apply_blur_to_frame(frame, blur_roi, self.blur_settings, 1.0, text_roi)
        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        """Return debug metadata."""
        return {"blur_regions": len(self.frame_blur_map)}