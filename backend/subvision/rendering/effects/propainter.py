"""ProPainter temporal video inpainting for subtitle removal."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np

from subvision.core.video_io import decode_frames_range, extract_frame_cv2
from subvision.rendering.effects.interface import Effect
from subvision.rendering.effects.propainter_engine import (
    ProPainterConfig,
    get_last_inference_ms,
    get_propainter_engine,
    is_propainter_available,
)
from subvision.rendering.geometry import calculate_text_roi

logger = logging.getLogger(__name__)

PrepareProgressCb = Callable[[int, int, str], None]

# Defaults matched to BlurSettings (5–10 min / 6 GB VRAM profile).
_DEFAULT_NEIGHBOR = 8
_DEFAULT_REF_STRIDE = 8
_DEFAULT_SUBVIDEO = 40
_DEFAULT_ROI_PAD = 40
_DEFAULT_MASK_DILATION = 6
_DEFAULT_MAX_WIDTH = 640
_DEFAULT_MAX_CLIP = 48


def _align_crop_roi(
    roi: Tuple[int, int, int, int],
    pad: int,
    frame_w: int,
    frame_h: int,
) -> Tuple[int, int, int, int]:
    x, y, w, h = roi
    x = max(0, x - pad)
    y = max(0, y - pad)
    w = min(frame_w - x, w + 2 * pad)
    h = min(frame_h - y, h + 2 * pad)
    w = max(8, w - w % 8)
    h = max(8, h - h % 8)
    if x + w > frame_w:
        x = max(0, frame_w - w)
    if y + h > frame_h:
        y = max(0, frame_h - h)
    return x, y, w, h


def _build_crop_mask(
    frame: np.ndarray,
    crop: Tuple[int, int, int, int],
    text_roi: Tuple[int, int, int, int],
    font_size_px: int,
) -> np.ndarray:
    """Filled rectangle in text ROI coords (mapped into crop)."""
    del frame, font_size_px
    cx, cy, cw, ch = crop
    mask = np.zeros((ch, cw), dtype=np.uint8)
    tx, ty, tw, th = text_roi
    if tw <= 0 or th <= 0:
        return mask
    lx = max(0, tx - cx)
    ly = max(0, ty - cy)
    rx = min(cw, tx + tw - cx)
    ry = min(ch, ty + th - cy)
    if rx > lx and ry > ly:
        inset_y = max(0, min(2, (ry - ly) // 20))
        inset_x = max(0, min(2, (rx - lx) // 20))
        mask[
            ly + inset_y : max(ly + inset_y + 1, ry - inset_y),
            lx + inset_x : max(lx + inset_x + 1, rx - inset_x),
        ] = 255
    return mask


def _edge_alpha(h: int, w: int, feather: int) -> np.ndarray:
    feather = max(0, min(feather, min(h, w) // 2))
    alpha = np.ones((h, w), dtype=np.float32)
    if feather <= 0:
        return alpha
    ramp = np.linspace(0.0, 1.0, feather, dtype=np.float32)
    for i, a in enumerate(ramp):
        alpha[i, :] = np.minimum(alpha[i, :], a)
        alpha[h - 1 - i, :] = np.minimum(alpha[h - 1 - i, :], a)
        alpha[:, i] = np.minimum(alpha[:, i], a)
        alpha[:, w - 1 - i] = np.minimum(alpha[:, w - 1 - i], a)
    return alpha


def _blend_crop_into_frame(
    frame: np.ndarray,
    crop_bgr: np.ndarray,
    crop: Tuple[int, int, int, int],
    feather: int,
) -> np.ndarray:
    cx, cy, cw, ch = crop
    out = frame.copy()
    region = out[cy : cy + ch, cx : cx + cw]
    if region.shape[:2] != crop_bgr.shape[:2]:
        out[cy : cy + ch, cx : cx + cw] = crop_bgr
        return out
    alpha = _edge_alpha(ch, cw, feather)[..., None]
    blended = crop_bgr.astype(np.float32) * alpha + region.astype(np.float32) * (1.0 - alpha)
    out[cy : cy + ch, cx : cx + cw] = np.clip(blended, 0, 255).astype(np.uint8)
    return out


def _fill_looks_failed(result_crop: np.ndarray, mask: np.ndarray, orig_crop: np.ndarray) -> bool:
    m = mask > 127
    if int(m.sum()) < 16:
        return False
    res_g = cv2.cvtColor(result_crop, cv2.COLOR_BGR2GRAY)
    orig_g = cv2.cvtColor(orig_crop, cv2.COLOR_BGR2GRAY)
    fill_mean = float(res_g[m].mean())
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    dil = cv2.dilate(mask, kernel, iterations=2)
    ring = (dil > 0) & ~m
    if ring.any():
        ring_mean = float(orig_g[ring].mean())
        if fill_mean < 20 and ring_mean > 40:
            return True
        if fill_mean < ring_mean * 0.25 and fill_mean < 35:
            return True
    return fill_mean < 12


def _config_from_settings(settings: Dict[str, Any]) -> ProPainterConfig:
    return ProPainterConfig(
        neighbor_length=int(settings.get("propainter_neighbor_length", _DEFAULT_NEIGHBOR)),
        ref_stride=int(settings.get("propainter_ref_stride", _DEFAULT_REF_STRIDE)),
        subvideo_length=int(settings.get("propainter_subvideo_length", _DEFAULT_SUBVIDEO)),
        fp16=bool(settings.get("propainter_fp16", True)),
        mask_dilation=int(settings.get("propainter_mask_dilation", _DEFAULT_MASK_DILATION)),
        max_width=int(settings.get("propainter_max_width", _DEFAULT_MAX_WIDTH)),
    )


def _context_pad_frames(neighbor_length: int, fps: float) -> int:
    half = max(1, neighbor_length // 2)
    return max(half * 2, 12, int(round(0.35 * max(fps, 1.0))))


def _eta_from_pace(t0: float, done: float, total: float) -> str:
    if done <= 0:
        return "..."
    elapsed = max(time.time() - t0, 1e-3)
    remaining = max(0.0, total - done)
    eta_sec = int(remaining * (elapsed / done))
    return f"{eta_sec // 60:02d}:{eta_sec % 60:02d}"


def apply_propainter_preview(
    frame: np.ndarray,
    frame_index: int,
    text_roi: Tuple[int, int, int, int],
    font_size_px: int,
    video_path: str,
    settings: Dict[str, Any],
) -> np.ndarray:
    """Preview: short clip around current frame; falls back to hybrid if engine unavailable."""
    if text_roi[2] <= 0 or text_roi[3] <= 0:
        return frame

    engine = get_propainter_engine(fp16=bool(settings.get("propainter_fp16", True)))
    if engine is None:
        from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint

        return _apply_hybrid_inpaint(frame, text_roi, font_size_px)

    height, width = frame.shape[:2]
    roi_pad = int(settings.get("propainter_roi_pad", _DEFAULT_ROI_PAD))
    crop = _align_crop_roi(text_roi, roi_pad, width, height)
    cx, cy, cw, ch = crop

    cfg = _config_from_settings(settings)
    pad = min(_context_pad_frames(cfg.neighbor_length, 24.0), max(cfg.neighbor_length, 8))
    clip_start = max(0, frame_index - pad)
    clip_end = frame_index + pad + 1

    decoded = decode_frames_range(video_path, clip_start, clip_end, use_hwaccel=False)
    if frame_index not in decoded and frame is not None:
        decoded[frame_index] = frame

    clip_frames: List[np.ndarray] = []
    clip_masks: List[np.ndarray] = []
    ordered_idx: List[int] = []
    for f_idx in range(clip_start, clip_end):
        f_bgr = decoded.get(f_idx)
        if f_bgr is None:
            continue
        ordered_idx.append(f_idx)
        mask = _build_crop_mask(
            f_bgr, crop, text_roi if f_idx == frame_index else (0, 0, 0, 0), font_size_px
        )
        clip_frames.append(f_bgr[cy : cy + ch, cx : cx + cw].copy())
        clip_masks.append(mask)

    if not clip_frames or frame_index not in ordered_idx:
        return frame
    target_idx = ordered_idx.index(frame_index)

    try:
        result = engine.inpaint(clip_frames, clip_masks, cfg)
    except Exception as exc:
        logger.error("ProPainter preview failed: %s", exc)
        from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint

        return _apply_hybrid_inpaint(frame, text_roi, font_size_px)

    feather = max(8, min(roi_pad // 2, 16))
    painted = result[target_idx]
    if _fill_looks_failed(painted, clip_masks[target_idx], clip_frames[target_idx]):
        from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint

        return _apply_hybrid_inpaint(frame, text_roi, font_size_px)

    return _blend_crop_into_frame(frame, painted, crop, feather)


class ProPainterInpaintEffect(Effect):
    """Segment-based ProPainter inpainting; inference runs in prepare()."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get("font_size", 21))
        self.roi_pad = int(blur_settings.get("propainter_roi_pad", _DEFAULT_ROI_PAD))
        self.max_clip_frames = int(blur_settings.get("propainter_max_clip_frames", _DEFAULT_MAX_CLIP))
        self.config = _config_from_settings(blur_settings)
        self.frame_inpaint_map: Dict[int, Tuple[int, int, int, int]] = {}
        self._frame_cache: Dict[int, np.ndarray] = {}
        self._segments_processed = 0
        self._prepare_progress: Optional[PrepareProgressCb] = None
        self._feather = max(8, min(self.roi_pad // 2, 16))

    def set_prepare_progress(self, cb: Optional[PrepareProgressCb]) -> None:
        self._prepare_progress = cb

    async def prepare(
        self,
        subtitles: List[Dict[str, Any]],
        width: int,
        height: int,
        fps: float,
        total_frames: int,
        video_path: str,
    ) -> None:
        self.frame_inpaint_map.clear()
        self._frame_cache.clear()
        self._segments_processed = 0

        if self.blur_settings.get("mode") != "propainter":
            return

        if not is_propainter_available():
            logger.error("ProPainter mode selected but engine/weights unavailable")
            return

        await asyncio.to_thread(
            self._process_segments,
            subtitles,
            width,
            height,
            fps,
            total_frames,
            video_path,
        )

    def _report(self, units_done: float, units_total: float, t0: float) -> None:
        if not self._prepare_progress:
            return
        # progress API expects ints; scale to centi-units for smooth bar movement
        total_i = max(1, int(round(units_total * 100)))
        cur_i = max(0, min(total_i, int(round(units_done * 100))))
        self._prepare_progress(cur_i, total_i, _eta_from_pace(t0, units_done, units_total))

    def _process_segments(
        self,
        subtitles: List[Dict[str, Any]],
        width: int,
        height: int,
        fps: float,
        total_frames: int,
        video_path: str,
    ) -> None:
        engine = get_propainter_engine(fp16=self.config.fp16)
        if engine is None:
            return

        pad = _context_pad_frames(self.config.neighbor_length, fps)
        max_clip = max(self.config.neighbor_length * 2, self.max_clip_frames)
        stride = max(max_clip // 2, self.config.neighbor_length)

        windows: List[Dict[str, Any]] = []
        for sub in subtitles:
            text = sub.get("text", "").strip()
            if not text:
                continue
            text_roi = calculate_text_roi(text, width, height, self.blur_settings)
            if text_roi[2] <= 0 or text_roi[3] <= 0:
                continue
            start_f = max(0, int(sub["start"] * fps) - 1)
            end_f = min(total_frames, int(sub["end"] * fps) + 1)
            if end_f <= start_f:
                continue
            win_start = start_f
            while win_start < end_f:
                win_end = min(end_f, win_start + max_clip)
                windows.append(
                    {
                        "text": text,
                        "roi": text_roi,
                        "cue_start": start_f,
                        "cue_end": end_f,
                        "win_start": win_start,
                        "win_end": win_end,
                    }
                )
                if win_end >= end_f:
                    break
                win_start += stride

        total_windows = len(windows)
        if total_windows == 0:
            return

        logger.info(
            "ProPainter: %d windows over %d cues (max_clip=%d, pad=%d, max_width=%d)",
            total_windows,
            len({(w["cue_start"], w["cue_end"]) for w in windows}),
            max_clip,
            pad,
            self.config.max_width,
        )
        self._report(0, total_windows, time.time())
        t0 = time.time()

        for wi, item in enumerate(windows):
            text = item["text"]
            text_roi = item["roi"]
            crop = _align_crop_roi(text_roi, self.roi_pad, width, height)
            cx, cy, cw, ch = crop
            win_start = item["win_start"]
            win_end = item["win_end"]
            clip_start = max(0, win_start - pad)
            clip_end = min(total_frames, win_end + pad)

            decoded = decode_frames_range(video_path, clip_start, clip_end, use_hwaccel=False)
            clip_frames: List[np.ndarray] = []
            clip_masks: List[np.ndarray] = []
            local_indices: List[int] = []

            for f_idx in range(clip_start, clip_end):
                f_bgr = decoded.get(f_idx)
                if f_bgr is None:
                    clip_frames.append(np.zeros((ch, cw, 3), dtype=np.uint8))
                    clip_masks.append(np.zeros((ch, cw), dtype=np.uint8))
                    local_indices.append(f_idx)
                    continue
                active_roi = text_roi if item["cue_start"] <= f_idx < item["cue_end"] else (0, 0, 0, 0)
                mask = _build_crop_mask(f_bgr, crop, active_roi, self.font_size_px)
                clip_frames.append(f_bgr[cy : cy + ch, cx : cx + cw].copy())
                clip_masks.append(mask)
                local_indices.append(f_idx)

            if not any(m.any() for m in clip_masks):
                self._report(wi + 1, total_windows, t0)
                continue

            def _clip_progress(frac: float, _wi=wi) -> None:
                self._report(_wi + max(0.0, min(1.0, frac)), total_windows, t0)

            try:
                logger.info(
                    "ProPainter window %d/%d (%s) frames=%d crop=%dx%d",
                    wi + 1,
                    total_windows,
                    text[:40],
                    len(clip_frames),
                    cw,
                    ch,
                )
                inpainted = engine.inpaint(clip_frames, clip_masks, self.config, progress_cb=_clip_progress)
            except Exception as exc:
                logger.error("ProPainter window failed (%s): %s", text[:40], exc)
                self._report(wi + 1, total_windows, t0)
                continue

            self._segments_processed += 1
            for local_i, f_idx in enumerate(local_indices):
                if f_idx < win_start or f_idx >= win_end:
                    continue
                full_frame = decoded.get(f_idx)
                if full_frame is None:
                    continue
                painted = inpainted[local_i]
                mask = clip_masks[local_i]
                orig_crop = clip_frames[local_i]

                if _fill_looks_failed(painted, mask, orig_crop):
                    from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint

                    result = _apply_hybrid_inpaint(full_frame.copy(), text_roi, self.font_size_px)
                else:
                    result = _blend_crop_into_frame(full_frame, painted, crop, self._feather)

                self._frame_cache[f_idx] = result
                self.frame_inpaint_map[f_idx] = crop

            self._report(wi + 1, total_windows, t0)

        logger.info(
            "ProPainterInpaintEffect: %d windows, %d cached frames (%.1fs)",
            self._segments_processed,
            len(self._frame_cache),
            time.time() - t0,
        )

    def apply(self, frame: np.ndarray, frame_index: int) -> np.ndarray:
        if frame_index in self._frame_cache:
            return self._frame_cache[frame_index]
        return frame

    def get_debug_info(self) -> Dict[str, Any]:
        return {
            "propainter_segments": self._segments_processed,
            "propainter_cached_frames": len(self._frame_cache),
            "propainter_inference_ms_per_frame": get_last_inference_ms(),
        }
