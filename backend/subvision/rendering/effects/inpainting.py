import logging
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np

from subvision.rendering.geometry import calculate_text_roi

logger = logging.getLogger(__name__)


def _odd_kernel_size(size: int, max_dim: int) -> int:
    k = min(size, max_dim if max_dim % 2 == 1 else max_dim - 1)
    if k < 3:
        return 3
    return k | 1


def generate_text_mask(frame: np.ndarray, roi: Tuple[int, int, int, int], font_size_px: int) -> np.ndarray:
    """Generate a binary mask for the text region, constrained to text ROI size."""
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0:
        return np.zeros((0, 0), dtype=np.uint8)

    roi_inner = frame[by : by + bh, bx : bx + bw]
    gray = cv2.cvtColor(roi_inner, cv2.COLOR_BGR2GRAY)
    grad_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, grad_kernel)

    _, text_mask = cv2.threshold(grad, 25, 255, cv2.THRESH_BINARY)

    fill_ksize = _odd_kernel_size(max(5, int(font_size_px * 0.5)), min(bw, bh))
    fill_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (fill_ksize, fill_ksize))
    text_mask = cv2.morphologyEx(text_mask, cv2.MORPH_CLOSE, fill_kernel)

    dilate_ksize = _odd_kernel_size(max(5, int(font_size_px * 0.3)), min(bw, bh))
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_ksize, dilate_ksize))
    text_mask = cv2.dilate(text_mask, dilate_kernel, iterations=1, borderType=cv2.BORDER_CONSTANT, borderValue=0)

    return text_mask


def _apply_hybrid_inpaint(frame: np.ndarray, roi: Tuple[int, int, int, int], font_size_px: int) -> np.ndarray:
    """Inpaint within text ROI only (green frame bounds)."""
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0:
        return frame

    roi_slice = frame[by : by + bh, bx : bx + bw].copy()
    mask = generate_text_mask(frame, roi, font_size_px)
    if mask.size == 0:
        return frame

    pre_dilate_k = _odd_kernel_size(max(3, int(font_size_px * 0.15)), min(bw, bh))
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (pre_dilate_k, pre_dilate_k))
    dilated_bg = cv2.dilate(roi_slice, dilate_kernel, borderType=cv2.BORDER_REPLICATE)
    roi_prepared = np.where(mask[..., None] > 0, dilated_bg, roi_slice)

    scale = 0.5
    small_w, small_h = int(roi_prepared.shape[1] * scale), int(roi_prepared.shape[0] * scale)

    if small_w > 0 and small_h > 0:
        small_roi = cv2.resize(roi_prepared, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
        small_mask = cv2.resize(mask, (small_w, small_h), interpolation=cv2.INTER_NEAREST)
        inpaint_radius = max(3, int((font_size_px * 0.3) * scale))
        small_inpainted = cv2.inpaint(small_roi, small_mask, inpaint_radius, cv2.INPAINT_NS)
        inpainted = cv2.resize(small_inpainted, (bw, bh), interpolation=cv2.INTER_LINEAR)
    else:
        inpaint_radius = max(3, int(font_size_px * 0.3))
        inpainted = cv2.inpaint(roi_prepared, mask, inpaint_radius, cv2.INPAINT_NS)

    smooth_k = _odd_kernel_size(max(11, int(font_size_px * 0.8)), min(bw, bh))
    inpainted_smooth = cv2.GaussianBlur(inpainted, (smooth_k, smooth_k), 0, borderType=cv2.BORDER_REPLICATE)

    blend_k = _odd_kernel_size(max(9, int(font_size_px * 0.6)), min(bw, bh))
    soft_mask = cv2.GaussianBlur(mask, (blend_k, blend_k), 0, borderType=cv2.BORDER_CONSTANT).astype(np.float32) / 255.0
    soft_mask_3ch = cv2.merge([soft_mask, soft_mask, soft_mask])

    inpainted_float = inpainted_smooth.astype(np.float32)
    original_float = roi_slice.astype(np.float32)
    blended = inpainted_float * soft_mask_3ch + original_float * (1.0 - soft_mask_3ch)
    frame[by : by + bh, bx : bx + bw] = blended.astype(np.uint8)
    return frame


class InpaintEffect:
    """Applies inpainting effect to subtitle regions."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get("font_size", 21))
        self.frame_inpaint_map: Dict[int, List[Tuple[Tuple[int, int, int, int], int]]] = {}

    async def prepare(
        self,
        subtitles: List[Dict[str, Any]],
        width: int,
        height: int,
        fps: float,
        total_frames: int,
        video_path: str,
    ) -> None:
        """Prepare inpainting regions and clear buffers."""
        if self.blur_settings.get("mode", "hybrid") != "hybrid":
            self.frame_inpaint_map.clear()
            return

        self.frame_inpaint_map.clear()

        for sub in subtitles:
            text = sub.get("text", "").strip()
            if not text:
                continue
            roi = calculate_text_roi(text, width, height, self.blur_settings)
            if roi[2] <= 0 or roi[3] <= 0:
                continue

            start_f = max(0, int(sub["start"] * fps) - 1)
            end_f = min(total_frames + 5, int(sub["end"] * fps) + 1)
            sub_id = sub.get("id", -1)
            for f_idx in range(start_f, end_f):
                if f_idx not in self.frame_inpaint_map:
                    self.frame_inpaint_map[f_idx] = []
                self.frame_inpaint_map[f_idx].append((roi, sub_id))

        total_entries = sum(len(v) for v in self.frame_inpaint_map.values())
        logger.info("InpaintEffect prepared %d frame-region entries across %d frames", total_entries, len(self.frame_inpaint_map))

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        """Apply inpainting to the frame."""
        if frame_index not in self.frame_inpaint_map:
            return frame

        for roi, _sub_id in self.frame_inpaint_map[frame_index]:
            frame = _apply_hybrid_inpaint(frame, roi, self.font_size_px)

        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        """Return debug metadata."""
        return {"inpaint_regions": len(self.frame_inpaint_map)}
