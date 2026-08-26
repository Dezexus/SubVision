"""ProPainter temporal video inpainting for subtitle removal."""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from subvision.core.video_io import extract_frame_cv2
from subvision.rendering.effects.inpainting import generate_text_mask
from subvision.rendering.effects.interface import Effect
from subvision.rendering.effects.propainter_engine import (
    ProPainterConfig,
    get_last_inference_ms,
    get_propainter_engine,
    is_propainter_available,
)
from subvision.rendering.geometry import calculate_text_roi

logger = logging.getLogger(__name__)


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
    cx, cy, cw, ch = crop
    full_mask = np.zeros((frame.shape[0], frame.shape[1]), dtype=np.uint8)
    tx, ty, tw, th = text_roi
    if tw > 0 and th > 0:
        local = generate_text_mask(frame, text_roi, font_size_px)
        full_mask[ty : ty + th, tx : tx + tw] = local
    return full_mask[cy : cy + ch, cx : cx + cw]


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

        logger.debug("ProPainter unavailable for preview, using hybrid fallback")
        return _apply_hybrid_inpaint(frame, text_roi, font_size_px)

    height, width = frame.shape[:2]
    roi_pad = int(settings.get("propainter_roi_pad", 32))
    crop = _align_crop_roi(text_roi, roi_pad, width, height)
    cx, cy, cw, ch = crop

    neighbor_length = int(settings.get("propainter_neighbor_length", 6))
    half = max(1, neighbor_length // 2)
    clip_start = max(0, frame_index - half)
    clip_end = frame_index + half + 1

    clip_frames: List[np.ndarray] = []
    clip_masks: List[np.ndarray] = []
    target_idx = frame_index - clip_start

    for f_idx in range(clip_start, clip_end):
        cached = extract_frame_cv2(video_path, f_idx)
        if cached is None:
            continue
        f_bgr, _ = cached
        mask = _build_crop_mask(f_bgr, crop, text_roi if f_idx == frame_index else (0, 0, 0, 0), font_size_px)
        clip_frames.append(f_bgr[cy : cy + ch, cx : cx + cw].copy())
        clip_masks.append(mask)

    if not clip_frames or target_idx >= len(clip_frames):
        return frame

    cfg = ProPainterConfig(
        neighbor_length=neighbor_length,
        ref_stride=int(settings.get("propainter_ref_stride", 10)),
        subvideo_length=int(settings.get("propainter_subvideo_length", 30)),
        fp16=bool(settings.get("propainter_fp16", True)),
        mask_dilation=int(settings.get("propainter_mask_dilation", 4)),
    )
    try:
        result = engine.inpaint(clip_frames, clip_masks, cfg)
    except Exception as exc:
        logger.error("ProPainter preview failed: %s", exc)
        from subvision.rendering.effects.inpainting import _apply_hybrid_inpaint

        return _apply_hybrid_inpaint(frame, text_roi, font_size_px)

    out = frame.copy()
    out[cy : cy + ch, cx : cx + cw] = result[target_idx]
    return out


class ProPainterInpaintEffect(Effect):
    """Segment-based ProPainter inpainting; inference runs in prepare()."""

    def __init__(self, blur_settings: Dict[str, Any]) -> None:
        self.blur_settings = blur_settings
        self.font_size_px = int(blur_settings.get("font_size", 21))
        self.roi_pad = int(blur_settings.get("propainter_roi_pad", 32))
        self.config = ProPainterConfig(
            neighbor_length=int(blur_settings.get("propainter_neighbor_length", 6)),
            ref_stride=int(blur_settings.get("propainter_ref_stride", 10)),
            subvideo_length=int(blur_settings.get("propainter_subvideo_length", 30)),
            fp16=bool(blur_settings.get("propainter_fp16", True)),
            mask_dilation=int(blur_settings.get("propainter_mask_dilation", 4)),
        )
        self.frame_inpaint_map: Dict[int, Tuple[int, int, int, int]] = {}
        self._frame_cache: Dict[int, np.ndarray] = {}
        self._segments_processed = 0

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

        half = max(1, self.config.neighbor_length // 2)

        for sub in subtitles:
            text = sub.get("text", "").strip()
            if not text:
                continue
            text_roi = calculate_text_roi(text, width, height, self.blur_settings)
            if text_roi[2] <= 0 or text_roi[3] <= 0:
                continue

            crop = _align_crop_roi(text_roi, self.roi_pad, width, height)
            cx, cy, cw, ch = crop

            start_f = max(0, int(sub["start"] * fps) - 1)
            end_f = min(total_frames, int(sub["end"] * fps) + 1)
            clip_start = max(0, start_f - half)
            clip_end = min(total_frames, end_f + half)

            clip_frames: List[np.ndarray] = []
            clip_masks: List[np.ndarray] = []

            for f_idx in range(clip_start, clip_end):
                cached = extract_frame_cv2(video_path, f_idx)
                if cached is None:
                    clip_frames.append(np.zeros((ch, cw, 3), dtype=np.uint8))
                    clip_masks.append(np.zeros((ch, cw), dtype=np.uint8))
                    continue
                f_bgr, _ = cached
                active_roi = text_roi if start_f <= f_idx < end_f else (0, 0, 0, 0)
                mask = _build_crop_mask(f_bgr, crop, active_roi, self.font_size_px)
                clip_frames.append(f_bgr[cy : cy + ch, cx : cx + cw].copy())
                clip_masks.append(mask)

            if not any(m.any() for m in clip_masks):
                continue

            try:
                inpainted = engine.inpaint(clip_frames, clip_masks, self.config)
            except Exception as exc:
                logger.error("ProPainter segment failed (%s): %s", text[:40], exc)
                continue

            self._segments_processed += 1
            for local_i, f_idx in enumerate(range(clip_start, clip_end)):
                if f_idx < start_f or f_idx >= end_f:
                    continue

                cached = extract_frame_cv2(video_path, f_idx)
                if cached is None:
                    continue
                full_frame, _ = cached
                full_frame = full_frame.copy()
                full_frame[cy : cy + ch, cx : cx + cw] = inpainted[local_i]
                self._frame_cache[f_idx] = full_frame
                self.frame_inpaint_map[f_idx] = crop

        logger.info(
            "ProPainterInpaintEffect: %d segments, %d cached frames",
            self._segments_processed,
            len(self._frame_cache),
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
