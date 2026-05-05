import logging
from typing import Tuple, Dict, Any, Optional, List
import cv2
import numpy as np
from core.gpu_utils import has_cuda
from rendering.effects.interface import Effect
from rendering.geometry import calculate_blur_roi, calculate_text_roi

logger = logging.getLogger(__name__)

def _apply_cuda_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], original_roi: np.ndarray, sigma: int, feather: int, alpha: float, text_mask: Optional[np.ndarray] = None) -> np.ndarray:
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

    if feather > 0 or alpha < 1.0 or text_mask is not None:
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
            cv2.rectangle(mask, (pt1_x, pt1_y), (pt2_x, pt2_y), 1.0, -1)
            mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
            if mask_ksize_val % 2 == 0:
                mask_ksize_val += 1
            mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)

        if text_mask is not None:
            text_mask_blurred = cv2.GaussianBlur(text_mask.astype(np.float32), (eff_feather * 2 + 1, eff_feather * 2 + 1), 0)
            mask = mask * (1.0 - text_mask_blurred / 255.0)

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

def _apply_cpu_blur(frame: np.ndarray, roi: Tuple[int, int, int, int], original_roi: np.ndarray, sigma: int, feather: int, alpha: float, text_mask: Optional[np.ndarray] = None) -> np.ndarray:
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

    if feather > 0 or alpha < 1.0 or text_mask is not None:
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
            cv2.rectangle(mask, (pt1_x, pt1_y), (pt2_x, pt2_y), 1.0, -1)
            mask_ksize_val = eff_feather + (1 if eff_feather % 2 == 0 else 0)
            if mask_ksize_val % 2 == 0:
                mask_ksize_val += 1
            mask = cv2.GaussianBlur(mask, (mask_ksize_val, mask_ksize_val), 0)

        if text_mask is not None:
            text_mask_blurred = cv2.GaussianBlur(text_mask.astype(np.float32), (eff_feather * 2 + 1, eff_feather * 2 + 1), 0)
            mask = mask * (1.0 - text_mask_blurred / 255.0)

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
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0 or alpha <= 0.0:
        return frame

    original_roi = frame[by:by+bh, bx:bx+bw].copy()

    sigma = int(settings.get('sigma', 5))
    feather = int(settings.get('feather', 30))

    if has_cuda():
        try:
            return _apply_cuda_blur(frame, roi, original_roi, sigma, feather, alpha)
        except cv2.error:
            pass

    return _apply_cpu_blur(frame, roi, original_roi, sigma, feather, alpha)

def apply_blur_around_text(frame: np.ndarray, blur_roi: Tuple[int, int, int, int], text_roi: Tuple[int, int, int, int], settings: Dict[str, Any], alpha: float = 1.0) -> np.ndarray:
    bx, by, bw, bh = blur_roi
    if bw <= 0 or bh <= 0 or alpha <= 0.0:
        return frame

    original_roi = frame[by:by+bh, bx:bx+bw].copy()

    sigma = int(settings.get('sigma', 5))
    feather = int(settings.get('feather', 30))

    text_mask = None
    if text_roi[2] > 0 and text_roi[3] > 0:
        tx, ty, tw, th = text_roi
        mask = np.zeros((bh, bw), dtype=np.uint8)
        rx = tx - bx
        ry = ty - by
        cv2.rectangle(mask, (rx, ry), (rx + tw - 1, ry + th - 1), 255, -1)
        text_mask = mask

    if has_cuda():
        try:
            return _apply_cuda_blur(frame, blur_roi, original_roi, sigma, feather, alpha, text_mask)
        except cv2.error:
            pass

    return _apply_cpu_blur(frame, blur_roi, original_roi, sigma, feather, alpha, text_mask)

class BlurEffect:
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
        logger.info("BlurEffect prepared: %d frame-region entries across %d frames",
                    roi_count, len(self.frame_blur_map))

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        if frame_index not in self.frame_blur_map:
            return frame

        for blur_roi, text_roi in self.frame_blur_map[frame_index]:
            frame = apply_blur_around_text(frame, blur_roi, text_roi, self.blur_settings)
        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        return {"blur_regions": len(self.frame_blur_map)}