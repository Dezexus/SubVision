"""Helpers for emotion JSON sidecar (schema v3+)."""

from __future__ import annotations

import math
import struct
import wave
from pathlib import Path
from typing import Any, Dict, List, Optional


def format_srt_timestamp(seconds: float) -> str:
    """Format seconds as SRT timestamp HH:MM:SS,mmm."""
    if seconds < 0:
        seconds = 0.0
    total_ms = int(round(seconds * 1000))
    ms = total_ms % 1000
    total_s = total_ms // 1000
    s = total_s % 60
    total_m = total_s // 60
    m = total_m % 60
    h = total_m // 60
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def format_srt_range(start: float, end: float) -> str:
    return f"{format_srt_timestamp(start)} --> {format_srt_timestamp(end)}"


def cue_duration(start: float, end: float) -> float:
    return round(max(0.0, end - start), 3)


def chars_per_second(text: str, duration_sec: float) -> Optional[float]:
    if duration_sec <= 0:
        return None
    chars = len(text.strip())
    if chars == 0:
        return 0.0
    return round(chars / duration_sec, 2)


def wav_rms_intensity(wav_path: Path) -> Optional[float]:
    """Normalized 0..1 arousal proxy from segment RMS (no extra ML)."""
    try:
        with wave.open(str(wav_path), "rb") as wf:
            n_frames = wf.getnframes()
            if n_frames <= 0:
                return None
            sample_width = wf.getsampwidth()
            raw = wf.readframes(n_frames)
        if sample_width == 2:
            count = len(raw) // 2
            samples = struct.unpack(f"<{count}h", raw[: count * 2])
        elif sample_width == 1:
            samples = struct.unpack(f"{len(raw)}B", raw)
            samples = [s - 128 for s in samples]
        else:
            return None
        if not samples:
            return None
        rms = math.sqrt(sum(s * s for s in samples) / len(samples))
        # 16-bit speech: typical RMS ~500–8000
        return round(min(1.0, rms / 6000.0), 3)
    except Exception:
        return None


def speakers_registry_from_profiles(profiles: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    """Keyed speaker registry for metadata."""
    registry: Dict[str, Dict[str, Any]] = {}
    for sid, profile in profiles.items():
        entry: Dict[str, Any] = {
            "gender": profile.get("gender", "unknown"),
            "gender_confidence": profile.get("gender_confidence"),
            "gender_source": profile.get("gender_source"),
        }
        role = profile.get("suggested_role")
        if role:
            entry["suggested_role"] = role
        registry[sid] = entry
    return registry


def build_audio_analysis_block(
    emotion_block: Optional[Dict[str, Any]],
    *,
    include_probs: bool,
    intensity: Optional[float],
) -> Optional[Dict[str, Any]]:
    if not emotion_block:
        return None
    block: Dict[str, Any] = {
        "primary_emotion": emotion_block.get("primary"),
        "confidence": emotion_block.get("confidence"),
    }
    if intensity is not None:
        block["intensity"] = intensity
    if include_probs and emotion_block.get("probs"):
        block["probs"] = emotion_block["probs"]
    return block


def build_structured_cue(
    *,
    cue_id: Any,
    start: float,
    end: float,
    text: str,
    ocr_conf: float,
    speaker_id: Optional[str],
    speaker_ids: List[str],
    speaker_gender: Optional[str],
    emotion_block: Optional[Dict[str, Any]],
    intensity: Optional[float],
    text_analysis: Optional[Dict[str, Any]],
    skipped: bool,
    skip_reason: Optional[str],
    fmt: Any,
    allow_multi_speaker: bool,
) -> Dict[str, Any]:
    duration = cue_duration(start, end)
    entry: Dict[str, Any] = {
        "id": cue_id,
        "timing": {
            "start": start,
            "end": end,
            "duration": duration,
            "timecode_srt": format_srt_range(start, end),
        },
        "skipped": skipped,
        "skip_reason": skip_reason if skipped else None,
    }
    if fmt.include_translations_block:
        entry["translations"] = {}

    if fmt.include_speaker_id:
        entry["speaker_id"] = speaker_id
        if allow_multi_speaker and speaker_ids:
            entry["speaker_ids"] = speaker_ids
    if fmt.include_speaker_gender and speaker_gender:
        entry["speaker_gender"] = speaker_gender

    if fmt.include_ocr_text:
        entry["source_text"] = text

    metrics: Dict[str, Any] = {}
    if fmt.include_ocr_conf:
        metrics["ocr_confidence"] = ocr_conf
    if fmt.include_readability_metrics and text.strip():
        cps = chars_per_second(text, duration)
        if cps is not None:
            metrics["chars_per_second"] = cps
    if metrics:
        entry["metrics"] = metrics

    audio = build_audio_analysis_block(
        emotion_block,
        include_probs=fmt.include_emotion_probs,
        intensity=intensity if fmt.include_audio_intensity else None,
    )
    if audio:
        entry["audio_analysis"] = audio

    if text_analysis:
        entry["text_analysis"] = text_analysis

    return entry
