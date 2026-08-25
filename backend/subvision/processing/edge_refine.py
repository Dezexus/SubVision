"""Frame-accurate subtitle boundary refinement via per-frame OCR in a local window."""

from __future__ import annotations

import logging
from typing import Any, Callable

from subvision.processing.ocr_engine import PaddleWrapper
from subvision.processing.text_utils import is_similar, normalize_text
from subvision.processing.video_reader import VideoProvider

logger = logging.getLogger(__name__)

SubtitleItem = dict[str, Any]
PresenceFn = Callable[[str, str], bool]


def text_matches_cue(ocr_text: str, cue_text: str, threshold: float = 0.55) -> bool:
    """Whether an OCR hit belongs to the given cue (presence test)."""
    a = normalize_text(ocr_text)
    b = normalize_text(cue_text)
    if not a or not b:
        return False
    if is_similar(a, b, threshold):
        return True
    if a in b or b in a:
        return True
    # Short cues: require stronger overlap via shared tokens
    ta, tb = set(a.lower().split()), set(b.lower().split())
    if not ta or not tb:
        return False
    return len(ta & tb) / max(len(ta), len(tb)) >= 0.5


def _time_to_frame(t: float, fps: float) -> int:
    return max(0, int(round(float(t) * fps)))


def _frame_to_time(frame_idx: int, fps: float) -> float:
    return float(frame_idx) / fps if fps > 0 else 0.0


def collect_refine_frames(
    items: list[SubtitleItem],
    fps: float,
    total_frames: int,
    window_frames: int,
) -> set[int]:
    """Frame indices needed to refine all cue start/end edges."""
    needed: set[int] = set()
    total = max(1, int(total_frames))
    win = max(1, int(window_frames))
    for item in items:
        s = _time_to_frame(item["start"], fps)
        e = _time_to_frame(item["end"], fps)
        for f in range(max(0, s - win), min(total, s + win + 1)):
            needed.add(f)
        for f in range(max(0, e - win), min(total, e + win + 1)):
            needed.add(f)
    return needed


def refine_edge_from_presence(
    presence: dict[int, bool],
    coarse_frame: int,
    window_frames: int,
    total_frames: int,
    find_start: bool,
) -> int:
    """
    Find first (start) or last (end) frame with presence=True in the local window.
    Falls back to ``coarse_frame`` if nothing matches.
    """
    win = max(1, int(window_frames))
    lo = max(0, coarse_frame - win)
    hi = min(int(total_frames) - 1, coarse_frame + win)
    if find_start:
        for f in range(lo, hi + 1):
            if presence.get(f):
                return f
        return coarse_frame
    last = coarse_frame
    found = False
    for f in range(lo, hi + 1):
        if presence.get(f):
            last = f
            found = True
    return last if found else coarse_frame


def snap_abutting(items: list[SubtitleItem], abut_gap_max: float = 0.08) -> None:
    """Resolve overlaps and tiny gaps between neighbouring cues (in-place)."""
    if len(items) < 2:
        return
    for i in range(1, len(items)):
        prev, curr = items[i - 1], items[i]
        gap = float(curr["start"]) - float(prev["end"])
        if gap < 0:
            boundary = (float(prev["end"]) + float(curr["start"])) / 2.0
            prev["end"] = boundary
            curr["start"] = boundary
        elif gap <= abut_gap_max:
            prev["end"] = curr["start"]
        if float(prev["end"]) <= float(prev["start"]):
            prev["end"] = float(prev["start"]) + 1.0 / 30.0
        if float(curr["end"]) <= float(curr["start"]):
            curr["end"] = float(curr["start"]) + 1.0 / 30.0


def refine_subtitle_boundaries(
    items: list[SubtitleItem],
    video_path: str,
    image_pipeline: Any,
    ocr_engine: Any,
    min_conf: float,
    fps: float,
    total_frames: int,
    window_frames: int,
    abut_gap_max: float = 0.08,
    cancellation: Any | None = None,
    on_progress: Callable[[int, int], None] | None = None,
) -> list[SubtitleItem]:
    """
    Re-OCR every frame in a ±window around each coarse start/end and snap
    boundaries to the first/last frame where the cue text is present.
    """
    if not items or fps <= 0:
        return items

    needed = collect_refine_frames(items, fps, total_frames, window_frames)
    if not needed:
        return items

    max_needed = max(needed)
    presence_by_cue: list[dict[int, bool]] = [{} for _ in items]
    ocr_at: dict[int, str] = {}

    reporter_log_every = max(1, len(needed) // 10)
    scanned = 0

    video = VideoProvider(video_path, step=1, use_hwaccel=True)
    try:
        for frame_idx, _timestamp, frame in video:
            if cancellation is not None and getattr(cancellation, "is_cancelled_sync", lambda: False)():
                logger.info("Edge refine cancelled.")
                return items
            if frame_idx > max_needed:
                break
            if frame_idx not in needed:
                continue

            text = ""
            roi = image_pipeline.crop_roi(frame)
            if roi is not None:
                final_img = image_pipeline.apply_filters_to_roi(roi)
                if final_img is not None:
                    raw = ocr_engine.predict_batch([final_img], use_det=True)
                    text, _conf = PaddleWrapper.parse_results(raw[0], min_conf)

            ocr_at[frame_idx] = text
            for i, item in enumerate(items):
                presence_by_cue[i][frame_idx] = text_matches_cue(text, str(item.get("text", "")))

            scanned += 1
            if on_progress and scanned % reporter_log_every == 0:
                on_progress(scanned, len(needed))
    finally:
        video.release()

    for i, item in enumerate(items):
        s0 = _time_to_frame(item["start"], fps)
        e0 = _time_to_frame(item["end"], fps)
        s1 = refine_edge_from_presence(presence_by_cue[i], s0, window_frames, total_frames, find_start=True)
        e1 = refine_edge_from_presence(presence_by_cue[i], e0, window_frames, total_frames, find_start=False)
        if e1 < s1:
            e1 = s1
        item["start"] = _frame_to_time(s1, fps)
        # Inclusive last frame → end just after that frame
        item["end"] = _frame_to_time(e1 + 1, fps)

    snap_abutting(items, abut_gap_max=abut_gap_max)
    logger.info("Edge refine done: scanned %d frames for %d cues.", scanned, len(items))
    return items
