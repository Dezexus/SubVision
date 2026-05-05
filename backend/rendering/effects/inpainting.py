import logging
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np

from rendering.effects.interface import Effect
from rendering.geometry import calculate_text_roi

logger = logging.getLogger(__name__)

def generate_text_mask(frame: np.ndarray, roi: Tuple[int, int, int, int], font_size_px: int) -> np.ndarray:
    bx, by, bw, bh = roi
    pad = max(5, int(font_size_px * 0.2))
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

    dilate_ksize = max(5, int(font_size_px * 0.3))
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_ksize, dilate_ksize))
    text_mask = cv2.dilate(text_mask, dilate_kernel, iterations=1)

    local_mask = np.zeros(roi_expanded.shape[:2], dtype=np.uint8)
    ly1 = by - y1
    ly2 = ly1 + bh
    lx1 = bx - x1
    lx2 = lx1 + bw
    local_mask[ly1:ly2, lx1:lx2] = text_mask

    return local_mask

class InpaintEffect:
    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get('font_size', 21))
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
        if self.blur_settings.get('mode', 'hybrid') != 'hybrid':
            self.frame_inpaint_map.clear()
            return

        self.frame_inpaint_map.clear()
        for sub in subtitles:
            text = sub.get('text', '').strip()
            if not text:
                continue
            roi = calculate_text_roi(text, width, height, self.blur_settings)
            if roi[2] <= 0 or roi[3] <= 0:
                continue

            start_f = max(0, int(sub['start'] * fps) - 1)
            end_f = min(total_frames + 5, int(sub['end'] * fps) + 1)
            sub_id = sub.get('id', -1)
            for f_idx in range(start_f, end_f):
                if f_idx not in self.frame_inpaint_map:
                    self.frame_inpaint_map[f_idx] = []
                self.frame_inpaint_map[f_idx].append((roi, sub_id))

        total_entries = sum(len(v) for v in self.frame_inpaint_map.values())
        logger.info("InpaintEffect prepared %d frame-region entries across %d frames",
                    total_entries, len(self.frame_inpaint_map))

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        if frame_index not in self.frame_inpaint_map:
            return frame

        for roi, sub_id in self.frame_inpaint_map[frame_index]:
            x, y, w_roi, h_roi = roi
            if w_roi <= 0 or h_roi <= 0:
                continue

            bx, by, bw, bh = x, y, w_roi, h_roi
            pad = max(5, int(self.font_size_px * 0.2))
            h, w = frame.shape[:2]
            y1 = max(0, by - pad)
            y2 = min(h, by + bh + pad)
            x1 = max(0, bx - pad)
            x2 = min(w, bx + bw + pad)

            roi_expanded = frame[y1:y2, x1:x2].copy()
            mask = generate_text_mask(frame, (bx, by, bw, bh), self.font_size_px)

            inpaint_radius = max(5, int(self.font_size_px * 0.3))
            inpainted = cv2.inpaint(roi_expanded, mask, inpaint_radius, cv2.INPAINT_NS)

            smooth_k = max(11, int(self.font_size_px * 0.8))
            if smooth_k % 2 == 0:
                smooth_k += 1
            inpainted_smooth = cv2.GaussianBlur(inpainted, (smooth_k, smooth_k), 0)

            blend_k = max(9, int(self.font_size_px * 0.6))
            if blend_k % 2 == 0:
                blend_k += 1

            soft_mask = cv2.GaussianBlur(mask, (blend_k, blend_k), 0).astype(np.float32) / 255.0
            soft_mask_3ch = cv2.merge([soft_mask, soft_mask, soft_mask])

            inpainted_float = inpainted_smooth.astype(np.float32)
            original_float = roi_expanded.astype(np.float32)

            blended = inpainted_float * soft_mask_3ch + original_float * (1.0 - soft_mask_3ch)
            frame[y1:y2, x1:x2] = blended.astype(np.uint8)

        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        return {"inpaint_regions": len(self.frame_inpaint_map)}