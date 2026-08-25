import logging
from typing import Tuple, Dict, Any, Optional, List
import cv2
import numpy as np
from subvision.core.gpu_utils import has_cuda
from subvision.rendering.geometry import (
    calculate_text_roi,
    calculate_blur_roi,
    core_relative_to_blur,
    build_soft_core_mask,
)
from subvision.rendering.blend import pyramid_blend

logger = logging.getLogger(__name__)


def build_effect_mask(
    bw: int,
    bh: int,
    core: Tuple[int, int, int, int],
    feather: int,
    alpha: float = 1.0,
) -> np.ndarray:
    """Soft rectangular core→pad mask (no glyph detection)."""
    return build_soft_core_mask(bw, bh, core, feather, alpha)


def _box_blur_roi(roi_img: np.ndarray, sigma: int) -> np.ndarray:
    if sigma <= 0:
        return roi_img.copy()
    k_size = sigma * 2 + 1
    bh, bw = roi_img.shape[:2]
    if bw > 300 and bh > 100 and sigma > 3:
        scale = 0.5
        small_roi = cv2.resize(roi_img, (0, 0), fx=scale, fy=scale, interpolation=cv2.INTER_LINEAR)
        small_k = max(3, int(k_size * scale))
        if small_k % 2 == 0:
            small_k += 1
        processed = cv2.boxFilter(small_roi, -1, (small_k, small_k))
        processed = cv2.boxFilter(processed, -1, (small_k, small_k))
        processed = cv2.boxFilter(processed, -1, (small_k, small_k))
        return cv2.resize(processed, (bw, bh), interpolation=cv2.INTER_LINEAR)

    processed = cv2.boxFilter(roi_img, -1, (k_size, k_size))
    processed = cv2.boxFilter(processed, -1, (k_size, k_size))
    processed = cv2.boxFilter(processed, -1, (k_size, k_size))
    return processed


def _process_roi_cpu(roi_img: np.ndarray, sigma: int) -> np.ndarray:
    return _box_blur_roi(roi_img, sigma)


def _process_roi_cuda(roi_img: np.ndarray, sigma: int) -> np.ndarray:
    gpu_roi = cv2.cuda_GpuMat()
    gpu_roi.upload(roi_img)
    if sigma > 0:
        k_size = sigma * 2 + 1
        box_filter = cv2.cuda.createBoxFilter(gpu_roi.type(), -1, (k_size, k_size))
        processed = box_filter.apply(gpu_roi)
        processed = box_filter.apply(processed)
        processed = box_filter.apply(processed)
        return processed.download()
    return roi_img.copy()


def apply_blur_to_frame(
    frame: np.ndarray,
    roi: Tuple[int, int, int, int],
    settings: Dict[str, Any],
    alpha: float = 1.0,
    inner_roi: Optional[Tuple[int, int, int, int]] = None,
    text_roi: Optional[Tuple[int, int, int, int]] = None,
) -> np.ndarray:
    """Blur inside padded ROI; soft core follows green text ROI; pyramid-blend the seam.

    ``roi`` is the padded blur ROI. ``text_roi`` (green) defines the hard core.
    If ``text_roi`` is omitted, ``inner_roi`` or full ``roi`` is used as core.
    """
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0 or alpha <= 0.0:
        return frame

    sigma = int(settings.get("sigma", 5))
    feather = int(settings.get("feather", 30))

    if text_roi is not None:
        core = core_relative_to_blur(text_roi, roi)
    elif inner_roi is not None:
        core = core_relative_to_blur(inner_roi, roi)
    else:
        # Fallback: treat most of the ROI as core with feather rim.
        inset = max(1, feather // 2)
        core = (inset, inset, max(1, bw - 2 * inset), max(1, bh - 2 * inset))

    original_roi = frame[by : by + bh, bx : bx + bw].copy()
    mask = build_effect_mask(bw, bh, core, feather, alpha)
    if float(mask.max()) < 1e-4:
        return frame

    try:
        if has_cuda():
            processed_roi = _process_roi_cuda(original_roi, sigma)
        else:
            processed_roi = _process_roi_cpu(original_roi, sigma)
    except cv2.error:
        processed_roi = _process_roi_cpu(original_roi, sigma)

    blended = pyramid_blend(original_roi, processed_roi, mask)
    frame[by : by + bh, bx : bx + bw] = blended
    return frame


class BlurEffect:
    """Applies temporal blur regions across frames."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        # (blur_roi, text_roi)
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
            text = sub.get("text", "").strip()
            if not text:
                continue
            text_roi = calculate_text_roi(text, width, height, blur_dict)
            blur_roi = calculate_blur_roi(text, width, height, blur_dict)
            if text_roi[2] <= 0 or text_roi[3] <= 0 or blur_roi[2] <= 0 or blur_roi[3] <= 0:
                continue
            start_f = max(0, int(sub["start"] * fps) - 1)
            end_f = min(total_frames + 5, int(sub["end"] * fps) + 1)
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
            frame = apply_blur_to_frame(frame, blur_roi, self.blur_settings, 1.0, text_roi=text_roi)
        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        """Return debug metadata."""
        return {"blur_regions": len(self.frame_blur_map)}
