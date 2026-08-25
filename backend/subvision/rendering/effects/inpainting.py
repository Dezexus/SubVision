import logging
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np

from subvision.rendering.geometry import (
    calculate_text_roi,
    calculate_blur_roi,
    core_relative_to_blur,
    build_soft_core_mask,
)
from subvision.rendering.blend import pyramid_blend

logger = logging.getLogger(__name__)


def _odd_kernel_size(size: int, max_dim: int) -> int:
    k = min(size, max_dim if max_dim % 2 == 1 else max_dim - 1)
    if k < 3:
        return 3
    return k | 1


def generate_text_mask(frame: np.ndarray, roi: Tuple[int, int, int, int], font_size_px: int) -> np.ndarray:
    """Legacy glyph-edge mask (kept for diagnostics / optional tools). Not used for hybrid blend."""
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


def _apply_hybrid_inpaint(
    frame: np.ndarray,
    text_roi: Tuple[int, int, int, int],
    blur_settings: Dict[str, Any],
    blur_roi: Tuple[int, int, int, int] | None = None,
) -> np.ndarray:
    """Inpaint the green core (soft-rect, no glyph mask) and pyramid-blend through outer feather pad."""
    font_size_px = int(blur_settings.get("font_size", 21))
    feather = int(blur_settings.get("feather", 30))

    if blur_roi is None:
        # Expand text_roi using same pad rules as calculate_blur_roi without re-estimating text width.
        tx, ty, tw, th = text_roi
        if tw <= 0 or th <= 0:
            return frame
        h, w = frame.shape[:2]
        pad_x = max(feather, int(font_size_px * 0.35))
        pad_y = max(feather, int(font_size_px * 0.25))
        bx = max(0, tx - pad_x)
        by = max(0, ty - pad_y)
        br = min(w, tx + tw + pad_x)
        bb = min(h, ty + th + pad_y)
        blur_roi = (bx, by, br - bx, bb - by)

    bx, by, bw, bh = blur_roi
    if bw <= 0 or bh <= 0:
        return frame

    core = core_relative_to_blur(text_roi, blur_roi)
    cx, cy, cw, ch = core
    if cw <= 0 or ch <= 0:
        return frame

    roi_slice = frame[by : by + bh, bx : bx + bw].copy()
    inpaint_mask = np.zeros((bh, bw), dtype=np.uint8)
    inpaint_mask[cy : cy + ch, cx : cx + cw] = 255

    inpaint_radius = max(3, int(font_size_px * 0.3))
    # TELEA is stabler on large filled rectangles than NS.
    inpainted = cv2.inpaint(roi_slice, inpaint_mask, inpaint_radius, cv2.INPAINT_TELEA)

    soft = build_soft_core_mask(bw, bh, core, feather, alpha=1.0)
    blended = pyramid_blend(roi_slice, inpainted, soft)
    frame[by : by + bh, bx : bx + bw] = blended
    return frame


class InpaintEffect:
    """Applies inpainting effect to subtitle regions."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get("font_size", 21))
        # (blur_roi, text_roi)
        self.frame_inpaint_map: Dict[int, List[Tuple[Tuple[int, int, int, int], Tuple[int, int, int, int]]]] = {}

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
            text_roi = calculate_text_roi(text, width, height, self.blur_settings)
            blur_roi = calculate_blur_roi(text, width, height, self.blur_settings)
            if text_roi[2] <= 0 or text_roi[3] <= 0 or blur_roi[2] <= 0 or blur_roi[3] <= 0:
                continue

            start_f = max(0, int(sub["start"] * fps) - 1)
            end_f = min(total_frames + 5, int(sub["end"] * fps) + 1)
            for f_idx in range(start_f, end_f):
                if f_idx not in self.frame_inpaint_map:
                    self.frame_inpaint_map[f_idx] = []
                self.frame_inpaint_map[f_idx].append((blur_roi, text_roi))

        total_entries = sum(len(v) for v in self.frame_inpaint_map.values())
        logger.info("InpaintEffect prepared %d frame-region entries across %d frames", total_entries, len(self.frame_inpaint_map))

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        """Apply inpainting to the frame."""
        if frame_index not in self.frame_inpaint_map:
            return frame

        for blur_roi, text_roi in self.frame_inpaint_map[frame_index]:
            frame = _apply_hybrid_inpaint(frame, text_roi, self.blur_settings, blur_roi)

        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        """Return debug metadata."""
        return {"inpaint_regions": len(self.frame_inpaint_map)}
