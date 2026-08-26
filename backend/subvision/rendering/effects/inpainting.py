"""Hybrid OpenCV inpainting for burned-in subtitle removal.

Contract: always hide the subtitle inside an active cue ROI.
Clean TELEA fill is best-effort; band-limited blur is the reliability floor.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from subvision.core.video_io import decode_frames_range
from subvision.rendering.geometry import calculate_text_roi

logger = logging.getLogger(__name__)


def _odd_kernel_size(size: int, max_dim: int) -> int:
    k = min(size, max_dim if max_dim % 2 == 1 else max_dim - 1)
    if k < 3:
        return 3
    return k | 1


def _text_band_mask(h: int, w: int, font_size_px: int, hint_mask: Optional[np.ndarray] = None) -> np.ndarray:
    """Hard horizontal band (~1.3×font) — kept for callers that need a binary mask."""
    band = np.zeros((h, w), dtype=np.uint8)
    half = max(4, int(font_size_px * 1.3 / 2))
    cy = _band_center_y(h, font_size_px, hint_mask)
    y0 = max(0, cy - half)
    y1 = min(h, cy + half + 1)
    band[y0:y1, :] = 255
    return band


def generate_text_mask(frame: np.ndarray, roi: Tuple[int, int, int, int], font_size_px: int) -> np.ndarray:
    """Binary mask for subtitle glyphs + outline inside ROI.

    Core of the original hybrid method (gradient + fixed thresh), plus tophat /
    blackhat so white fills and dark drop-shadows are both covered. Strong dilate
    closes the outline halo.
    """
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0:
        return np.zeros((0, 0), dtype=np.uint8)

    roi_inner = frame[by : by + bh, bx : bx + bw]
    gray = cv2.cvtColor(roi_inner, cv2.COLOR_BGR2GRAY)

    grad_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    grad = cv2.morphologyEx(gray, cv2.MORPH_GRADIENT, grad_kernel)
    _, grad_mask = cv2.threshold(grad, 25, 255, cv2.THRESH_BINARY)

    stroke_k = _odd_kernel_size(max(5, int(font_size_px * 0.5)), min(bw, bh))
    stroke_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (stroke_k, stroke_k))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, stroke_kernel)
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, stroke_kernel)
    _, dark = cv2.threshold(blackhat, 12, 255, cv2.THRESH_BINARY)
    _, bright = cv2.threshold(tophat, 12, 255, cv2.THRESH_BINARY)

    text_mask = cv2.bitwise_or(grad_mask, cv2.bitwise_or(dark, bright))

    fill_ksize = _odd_kernel_size(max(5, int(font_size_px * 0.5)), min(bw, bh))
    fill_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (fill_ksize, fill_ksize))
    text_mask = cv2.morphologyEx(text_mask, cv2.MORPH_CLOSE, fill_kernel)

    # Strong dilate so dark drop-shadow / outline around white glyphs is covered.
    dilate_ksize = _odd_kernel_size(max(5, int(font_size_px * 0.4)), min(bw, bh))
    dilate_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (dilate_ksize, dilate_ksize))
    text_mask = cv2.dilate(
        text_mask, dilate_kernel, iterations=1, borderType=cv2.BORDER_CONSTANT, borderValue=0
    )
    return text_mask


def tight_box_from_mask(
    mask: np.ndarray,
    roi: Tuple[int, int, int, int],
    pad: int,
    *,
    keep_height: bool = False,
) -> Tuple[Tuple[int, int, int, int], np.ndarray]:
    """Shrink ROI to mask bbox (+pad) when mask is non-empty; else keep full ROI.

    keep_height=True: tighten only horizontally so vertical feather still has room
    inside the geometric text ROI (avoids a hard rectangular strip).
    """
    bx, by, bw, bh = roi
    if mask.size == 0 or bw <= 0 or bh <= 0:
        return roi, mask if mask.size else np.zeros((max(bh, 0), max(bw, 0)), dtype=np.uint8)

    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        return roi, mask

    x0 = max(0, int(xs.min()) - pad)
    x1 = min(bw, int(xs.max()) + 1 + pad)
    if keep_height:
        y0, y1 = 0, bh
    else:
        y0 = max(0, int(ys.min()) - pad)
        y1 = min(bh, int(ys.max()) + 1 + pad)
    if x1 <= x0 or y1 <= y0:
        return roi, mask

    cropped = mask[y0:y1, x0:x1].copy()
    abs_roi = (bx + x0, by + y0, x1 - x0, y1 - y0)
    return abs_roi, cropped


def median_masks(masks: List[np.ndarray]) -> Optional[np.ndarray]:
    """Pixel-wise median of binary masks (stabilises cue-local flicker)."""
    valid = [m for m in masks if m is not None and m.size > 0]
    if not valid:
        return None
    if len(valid) == 1:
        return valid[0]
    h = min(m.shape[0] for m in valid)
    w = min(m.shape[1] for m in valid)
    stack = np.stack([m[:h, :w] for m in valid], axis=0).astype(np.float32)
    med = np.median(stack, axis=0)
    return (med >= 127).astype(np.uint8) * 255


def _mask_coverage(mask: np.ndarray) -> float:
    if mask.size == 0:
        return 0.0
    return float(cv2.countNonZero(mask)) / float(mask.size)


def _band_center_y(h: int, font_size_px: int, hint_mask: Optional[np.ndarray]) -> int:
    cy = h // 2
    if hint_mask is not None and hint_mask.size == h * hint_mask.shape[1] and hint_mask.any():
        row_density = (hint_mask > 0).sum(axis=1).astype(np.float32)
        if float(row_density.max()) > 0:
            k = _odd_kernel_size(max(5, font_size_px // 2), h)
            smooth = cv2.GaussianBlur(row_density.reshape(-1, 1), (1, k), 0).ravel()
            cy = int(np.argmax(smooth))
    return cy


def _cosine_falloff_1d(size: int, center: float, core_half: float, feather: float) -> np.ndarray:
    """1.0 inside core, cosine 1→0 over feather, 0 beyond."""
    coords = np.arange(size, dtype=np.float32)
    dist = np.abs(coords - center)
    alpha = np.zeros(size, dtype=np.float32)
    core = max(0.0, float(core_half))
    feather = max(1.0, float(feather))
    inside = dist <= core
    alpha[inside] = 1.0
    zone = (dist > core) & (dist <= core + feather)
    t = (dist[zone] - core) / feather
    alpha[zone] = 0.5 * (1.0 + np.cos(np.pi * t))
    return alpha


def _soft_roi_window(h: int, w: int, feather_y: int, feather_x: int) -> np.ndarray:
    """2D window that is ~1 in the interior and 0 at ROI borders (smooth edges)."""
    fy = max(1, min(int(feather_y), max(1, h // 2)))
    fx = max(1, min(int(feather_x), max(1, w // 2)))
    # Distance-from-edge ramps (0 at border → 1 after feather).
    y = np.arange(h, dtype=np.float32)
    x = np.arange(w, dtype=np.float32)
    top = np.clip(y / fy, 0.0, 1.0)
    bottom = np.clip((h - 1 - y) / fy, 0.0, 1.0)
    left = np.clip(x / fx, 0.0, 1.0)
    right = np.clip((w - 1 - x) / fx, 0.0, 1.0)
    # Smoothstep for gentler corners.
    def _smooth(t: np.ndarray) -> np.ndarray:
        return t * t * (3.0 - 2.0 * t)

    vy = _smooth(np.minimum(top, bottom))
    vx = _smooth(np.minimum(left, right))
    return vy[:, None] * vx[None, :]


def _expand_roi_clamped(
    roi: Tuple[int, int, int, int],
    pad_x: int,
    pad_y: int,
    frame_w: int,
    frame_h: int,
) -> Tuple[Tuple[int, int, int, int], Tuple[int, int]]:
    """Expand ROI for blend margin; returns (expanded_roi, (ox, oy) of original inside it)."""
    bx, by, bw, bh = roi
    x0 = max(0, bx - pad_x)
    y0 = max(0, by - pad_y)
    x1 = min(frame_w, bx + bw + pad_x)
    y1 = min(frame_h, by + bh + pad_y)
    return (x0, y0, x1 - x0, y1 - y0), (bx - x0, by - y0)


def _band_blur_alpha(
    h: int,
    w: int,
    font_size_px: int,
    hint_mask: Optional[np.ndarray],
    *,
    pad_y: int,
) -> np.ndarray:
    """Soft alpha: narrow solid core + wide cosine falloff that reaches ~0 at crop borders."""
    cy = _band_center_y(h, font_size_px, hint_mask)
    core_half = max(2.0, font_size_px * 0.4)
    # Feather uses the expansion pad so opacity dies before the crop edge.
    feather_y = max(float(pad_y), font_size_px * 1.1, h * 0.35)
    max_half = max(2.0, (h - 1) * 0.49)
    if core_half + feather_y > max_half:
        feather_y = max(8.0, max_half * 0.72)
        core_half = max(1.0, max_half - feather_y)

    vert = _cosine_falloff_1d(h, float(cy), core_half, feather_y)
    alpha = np.broadcast_to(vert[:, None], (h, w)).copy()

    feather_x = max(10, int(font_size_px * 0.5), int(pad_y * 0.35))
    window = _soft_roi_window(h, w, feather_y=max(pad_y, int(feather_y)), feather_x=feather_x)
    return np.clip(alpha * window, 0.0, 1.0)


def _gaussian_blur_blend(
    crop: np.ndarray,
    alpha: np.ndarray,
    sigma: int,
) -> np.ndarray:
    """Blur crop with reflect border, then soft-blend by alpha (avoids hard ROI plate)."""
    sigma = max(1, int(sigma))
    k = _odd_kernel_size(sigma * 2 + 1, max(crop.shape[0], crop.shape[1]))
    blurred = cv2.GaussianBlur(crop, (k, k), sigmaX=float(sigma), borderType=cv2.BORDER_REFLECT_101)
    a = alpha.astype(np.float32)[..., None]
    out = blurred.astype(np.float32) * a + crop.astype(np.float32) * (1.0 - a)
    return np.clip(out, 0, 255).astype(np.uint8)


def _apply_hybrid_inpaint(
    frame: np.ndarray,
    roi: Tuple[int, int, int, int],
    font_size_px: int,
    mask: Optional[np.ndarray] = None,
    *,
    apply_residual_blur: bool = True,
    blur_settings: Optional[Dict[str, Any]] = None,
) -> np.ndarray:
    """Inpaint glyphs then always apply soft band blur with expanded feather margin."""
    bx, by, bw, bh = roi
    if bw <= 0 or bh <= 0:
        return frame

    fh, fw = frame.shape[:2]
    # Expand so blur samples hair/bg above & below the green UI box; seam dissolves outside it.
    pad_y = max(20, int(font_size_px * 1.4))
    pad_x = max(12, int(font_size_px * 0.5))
    work_roi, (ox, oy) = _expand_roi_clamped(roi, pad_x, pad_y, fw, fh)
    wx, wy, ww, wh = work_roi
    if ww <= 0 or wh <= 0:
        return frame

    if mask is None:
        mask = generate_text_mask(frame, roi, font_size_px)
    if mask.size == 0:
        mask = np.zeros((bh, bw), dtype=np.uint8)
    elif mask.shape[:2] != (bh, bw):
        mask = cv2.resize(mask, (bw, bh), interpolation=cv2.INTER_NEAREST)

    work_mask = np.zeros((wh, ww), dtype=np.uint8)
    y1 = min(wh, oy + bh)
    x1 = min(ww, ox + bw)
    if y1 > oy and x1 > ox:
        work_mask[oy:y1, ox:x1] = mask[: y1 - oy, : x1 - ox]

    original_work = frame[wy : wy + wh, wx : wx + ww].copy()
    crop = original_work.copy()
    coverage = _mask_coverage(work_mask)

    # Layer A: TELEA when we have any usable stroke mask.
    if coverage > 0.0:
        pre_dilate_k = _odd_kernel_size(max(3, int(font_size_px * 0.2)), min(ww, wh))
        dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (pre_dilate_k, pre_dilate_k))
        dilated_bg = cv2.dilate(crop, dilate_kernel, borderType=cv2.BORDER_REPLICATE)
        prepared = np.where(work_mask[..., None] > 0, dilated_bg, crop)

        use_full_res = (ww * wh) <= (640 * 160)
        inpaint_radius = max(3, int(font_size_px * 0.4))

        if use_full_res:
            inpainted = cv2.inpaint(prepared, work_mask, inpaint_radius, cv2.INPAINT_TELEA)
        else:
            scale = 0.5
            small_w = max(1, int(ww * scale))
            small_h = max(1, int(wh * scale))
            small_roi = cv2.resize(prepared, (small_w, small_h), interpolation=cv2.INTER_LINEAR)
            small_mask = cv2.resize(work_mask, (small_w, small_h), interpolation=cv2.INTER_NEAREST)
            small_r = max(2, int(inpaint_radius * scale))
            small_inpainted = cv2.inpaint(small_roi, small_mask, small_r, cv2.INPAINT_TELEA)
            inpainted = cv2.resize(small_inpainted, (ww, wh), interpolation=cv2.INTER_LINEAR)

        blend_k = _odd_kernel_size(max(7, int(font_size_px * 0.35)), min(ww, wh))
        soft = (
            cv2.GaussianBlur(work_mask, (blend_k, blend_k), 0, borderType=cv2.BORDER_CONSTANT).astype(np.float32)
            / 255.0
        )
        soft = np.clip(soft * 1.2, 0.0, 1.0)
        # Keep inpaint away from expanded borders so we don't invent a plate edge.
        soft *= _soft_roi_window(wh, ww, feather_y=max(8, pad_y // 2), feather_x=max(6, pad_x // 2))
        soft_3 = soft[..., None]
        crop = np.clip(
            inpainted.astype(np.float32) * soft_3 + crop.astype(np.float32) * (1.0 - soft_3),
            0,
            255,
        ).astype(np.uint8)
        frame[wy : wy + wh, wx : wx + ww] = crop

    # Layer B: soft band / glyph residual blur — Gaussian on expanded crop (reflect borders).
    if apply_residual_blur:
        settings = blur_settings or {}
        band_alpha = _band_blur_alpha(
            wh, ww, font_size_px, work_mask if coverage > 0 else None, pad_y=pad_y
        )
        if coverage > 0:
            glyph = work_mask.astype(np.float32) / 255.0
            gk = _odd_kernel_size(max(9, int(font_size_px * 0.55)), min(ww, wh))
            glyph = cv2.GaussianBlur(glyph, (gk, gk), 0, borderType=cv2.BORDER_CONSTANT) * 0.85
            band_alpha = np.clip(np.maximum(band_alpha, glyph), 0.0, 1.0)
            band_alpha *= _soft_roi_window(wh, ww, feather_y=pad_y, feather_x=max(pad_x, 10))

        if float(band_alpha.max()) > 0.02:
            sigma = max(10, int(settings.get("sigma", 5)), int(font_size_px * 0.55))
            # Write blur from current frame crop (includes inpaint).
            crop = frame[wy : wy + wh, wx : wx + ww]
            frame[wy : wy + wh, wx : wx + ww] = _gaussian_blur_blend(crop, band_alpha, sigma)

    return frame


class InpaintEffect:
    """Hybrid inpaint + band blur. Masks are stabilised per cue; empty mask still blurs."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get("font_size", 21))
        # frame -> list of (roi, mask); mask may be all-zeros → band-blur only
        self.frame_inpaint_map: Dict[int, List[Tuple[Tuple[int, int, int, int], np.ndarray]]] = {}

    async def prepare(
        self,
        subtitles: List[Dict[str, Any]],
        width: int,
        height: int,
        fps: float,
        total_frames: int,
        video_path: str,
    ) -> None:
        if self.blur_settings.get("mode", "hybrid") != "hybrid":
            self.frame_inpaint_map.clear()
            return

        self.frame_inpaint_map.clear()
        pad = max(2, int(self.font_size_px * 0.2))

        for sub in subtitles:
            text = sub.get("text", "").strip()
            if not text:
                continue
            roi = calculate_text_roi(text, width, height, self.blur_settings)
            if roi[2] <= 0 or roi[3] <= 0:
                continue

            start_f = max(0, int(sub["start"] * fps) - 1)
            end_f = min(total_frames, int(sub["end"] * fps) + 1)
            if end_f <= start_f:
                continue

            span = end_f - start_f
            if span <= 1:
                sample_idxs = [start_f]
            else:
                n_samples = min(5, span)
                sample_idxs = sorted(
                    {
                        start_f + int(round(i * (span - 1) / max(n_samples - 1, 1)))
                        for i in range(n_samples)
                    }
                )

            decoded = decode_frames_range(
                video_path, min(sample_idxs), max(sample_idxs) + 1, use_hwaccel=False
            )
            sample_masks: List[np.ndarray] = []
            for idx in sample_idxs:
                f_bgr = decoded.get(idx)
                if f_bgr is None:
                    continue
                sample_masks.append(generate_text_mask(f_bgr, roi, self.font_size_px))

            stable = median_masks(sample_masks)
            if stable is None or _mask_coverage(stable) <= 0.0:
                # Never drop the cue — geometric ROI + empty mask → band-blur only.
                work_roi = roi
                work_mask = np.zeros((roi[3], roi[2]), dtype=np.uint8)
            else:
                work_roi, work_mask = tight_box_from_mask(stable, roi, pad, keep_height=True)
                if work_roi[2] <= 0 or work_roi[3] <= 0:
                    work_roi = roi
                    work_mask = np.zeros((roi[3], roi[2]), dtype=np.uint8)

            for f_idx in range(start_f, end_f):
                if f_idx not in self.frame_inpaint_map:
                    self.frame_inpaint_map[f_idx] = []
                self.frame_inpaint_map[f_idx].append((work_roi, work_mask))

        total_entries = sum(len(v) for v in self.frame_inpaint_map.values())
        logger.info(
            "InpaintEffect prepared %d frame-region entries across %d frames",
            total_entries,
            len(self.frame_inpaint_map),
        )

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        if frame_index not in self.frame_inpaint_map:
            return frame

        for roi, mask in self.frame_inpaint_map[frame_index]:
            frame = _apply_hybrid_inpaint(
                frame,
                roi,
                self.font_size_px,
                mask=mask,
                apply_residual_blur=True,
                blur_settings=self.blur_settings,
            )
        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        return {"inpaint_regions": len(self.frame_inpaint_map)}
