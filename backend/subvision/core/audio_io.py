"""Audio extraction utilities for emotion export."""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Optional, Tuple

from subvision.core.config import settings
from subvision.domain.emotion_models import EmotionExportSettings

logger = logging.getLogger(__name__)


def _resolve_temp_dir(cfg: EmotionExportSettings) -> Path:
    root = Path(cfg.temp_dir)
    if not root.is_absolute():
        root = Path(settings.cache_dir).parent / root if str(root).startswith("uploads") else Path(settings.cache_dir) / ".temp" / "audio"
    root.mkdir(parents=True, exist_ok=True)
    return root


def clamp_cue_window(
    start: float,
    end: float,
    cfg: EmotionExportSettings,
    video_duration: Optional[float] = None,
) -> Tuple[float, float, bool, Optional[str]]:
    """Return clamped [start, end] and skip flag."""
    duration = end - start
    if duration < cfg.min_cue_duration_sec:
        return start, end, True, "too_short"

    pad_before = cfg.cue_padding_before_sec
    pad_after = cfg.cue_padding_after_sec
    s = max(0.0, start - pad_before)
    e = end + pad_after
    if video_duration is not None:
        e = min(e, video_duration)
    if e <= s:
        return s, e, True, "invalid_window"

    seg_len = e - s
    if seg_len > cfg.max_cue_duration_sec:
        mid = (start + end) / 2.0
        half = cfg.max_cue_duration_sec / 2.0
        s = max(0.0, mid - half)
        e = s + cfg.max_cue_duration_sec
        if video_duration is not None:
            e = min(e, video_duration)
            s = max(0.0, e - cfg.max_cue_duration_sec)

    return s, e, False, None


def extract_audio_segment(
    video_path: str,
    start_sec: float,
    end_sec: float,
    cfg: EmotionExportSettings,
    out_path: Optional[Path] = None,
) -> Optional[Path]:
    """Extract mono PCM wav segment via ffmpeg."""
    if end_sec <= start_sec:
        return None

    temp_dir = _resolve_temp_dir(cfg)
    if out_path is None:
        out_path = temp_dir / f"seg_{uuid.uuid4().hex}.wav"

    track = cfg.audio_track_index
    cmd = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-to",
        f"{end_sec:.3f}",
        "-i",
        video_path,
        "-map",
        f"0:a:{track}?" if track else "0:a:0?",
        "-vn",
        "-ac",
        str(cfg.channels),
        "-ar",
        str(cfg.sample_rate_hz),
        "-f",
        "wav",
        str(out_path),
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0 or not out_path.exists() or out_path.stat().st_size < 44:
            logger.debug("ffmpeg extract failed: %s", proc.stderr[-500:] if proc.stderr else "")
            return None
        if cfg.normalize_audio:
            _peak_normalize_wav(out_path)
        return out_path
    except (subprocess.SubprocessError, OSError) as exc:
        logger.warning("Audio extract error: %s", exc)
        return None


def _peak_normalize_wav(path: Path) -> None:
    """Simple peak normalize in-place via ffmpeg."""
    tmp = path.with_suffix(".norm.wav")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(path),
        "-af",
        "dynaudnorm",
        str(tmp),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=60, check=False)
        if proc.returncode == 0 and tmp.exists():
            tmp.replace(path)
        elif tmp.exists():
            tmp.unlink(missing_ok=True)
    except (subprocess.SubprocessError, OSError):
        if tmp.exists():
            tmp.unlink(missing_ok=True)


def extract_full_audio_wav(
    video_path: str,
    cfg: EmotionExportSettings,
    out_path: Optional[Path] = None,
) -> Optional[Path]:
    """Extract full audio track for diarization."""
    temp_dir = _resolve_temp_dir(cfg)
    if out_path is None:
        out_path = temp_dir / f"full_{uuid.uuid4().hex}.wav"
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-map",
        f"0:a:{cfg.audio_track_index}?" if cfg.audio_track_index else "0:a:0?",
        "-vn",
        "-ac",
        "1",
        "-ar",
        str(cfg.sample_rate_hz),
        str(out_path),
    ]
    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=600, check=False)
        if proc.returncode != 0 or not out_path.exists():
            return None
        return out_path
    except (subprocess.SubprocessError, OSError) as exc:
        logger.warning("Full audio extract failed: %s", exc)
        return None
