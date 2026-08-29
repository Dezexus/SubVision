"""Speaker gender classification (optional HF model + stub)."""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Literal, Optional

from subvision.core.audio_io import extract_audio_segment
from subvision.domain.emotion_models import EmotionExportSettings, GenderSettings, SpeakerGender
from subvision.processing.diarization_engine import SpeakerSegment

logger = logging.getLogger(__name__)

_TRANSFORMERS_AVAILABLE: Optional[bool] = None


def gender_model_available() -> bool:
    global _TRANSFORMERS_AVAILABLE
    if _TRANSFORMERS_AVAILABLE is None:
        try:
            import transformers  # noqa: F401

            _TRANSFORMERS_AVAILABLE = True
        except ImportError:
            _TRANSFORMERS_AVAILABLE = False
    return _TRANSFORMERS_AVAILABLE


@dataclass
class SpeakerGenderProfile:
    speaker_id: str
    gender: SpeakerGender
    confidence: float
    source: Literal["auto", "manual", "stub"]


def _top_segments_for_speaker(
    speaker_id: str,
    segments: List[SpeakerSegment],
    max_count: int,
) -> List[SpeakerSegment]:
    matched = [s for s in segments if s.speaker_id == speaker_id]
    matched.sort(key=lambda s: s.end - s.start, reverse=True)
    return matched[:max_count]


def _stub_gender(speaker_id: str) -> SpeakerGender:
    digest = hashlib.sha256(speaker_id.encode()).hexdigest()
    bucket = int(digest[:2], 16) % 3
    return ("male", "female", "unknown")[bucket]  # type: ignore[return-value]


class GenderEngine:
    def __init__(self, cfg: GenderSettings, export_cfg: EmotionExportSettings) -> None:
        self.cfg = cfg
        self.export_cfg = export_cfg
        self._pipeline = None

    def _load_pipeline(self) -> None:
        if self._pipeline is not None:
            return
        if not gender_model_available():
            self._pipeline = "stub"
            return
        try:
            from transformers import pipeline

            self._pipeline = pipeline(
                "audio-classification",
                model=self.cfg.model_id,
                device=-1,
            )
        except Exception as exc:
            logger.warning("Gender model load failed, using stub: %s", exc)
            self._pipeline = "stub"

    def _classify_wav(self, wav_path: Path) -> tuple[SpeakerGender, float]:
        self._load_pipeline()
        if self._pipeline == "stub":
            return "unknown", 0.0
        try:
            result = self._pipeline(str(wav_path))
            if not result:
                return "unknown", 0.0
            top = result[0]
            label = str(top.get("label", "")).lower()
            score = float(top.get("score", 0.0))
            if "female" in label or label == "f":
                gender: SpeakerGender = "female"
            elif "male" in label or label == "m":
                gender = "male"
            else:
                gender = "unknown"
            if score < self.cfg.confidence_threshold:
                return "unknown", score
            return gender, score
        except Exception as exc:
            logger.debug("gender classify failed: %s", exc)
            return "unknown", 0.0

    def classify_speakers(
        self,
        video_path: str,
        segments: List[SpeakerSegment],
        speaker_ids: List[str],
    ) -> Dict[str, SpeakerGenderProfile]:
        if not self.cfg.enabled or not speaker_ids:
            return {}

        profiles: Dict[str, SpeakerGenderProfile] = {}
        for sid in speaker_ids:
            if self._pipeline is None:
                self._load_pipeline()

            if self._pipeline == "stub":
                g = _stub_gender(sid)
                profiles[sid] = SpeakerGenderProfile(sid, g, 0.5 if g != "unknown" else 0.0, "stub")
                continue

            top_segs = _top_segments_for_speaker(sid, segments, self.cfg.max_segments_per_speaker)
            best_gender: SpeakerGender = "unknown"
            best_conf = 0.0
            for seg in top_segs:
                seg_len = seg.end - seg.start
                if seg_len < self.cfg.min_segment_sec:
                    continue
                wav = extract_audio_segment(video_path, seg.start, seg.end, self.export_cfg)
                if wav is None:
                    continue
                try:
                    g, conf = self._classify_wav(wav)
                    if conf > best_conf:
                        best_gender, best_conf = g, conf
                finally:
                    if wav.exists():
                        wav.unlink(missing_ok=True)

            profiles[sid] = SpeakerGenderProfile(
                sid,
                best_gender if best_conf >= self.cfg.confidence_threshold else "unknown",
                best_conf,
                "auto",
            )
        return profiles


def apply_gender_overrides(
    profiles: Dict[str, SpeakerGenderProfile],
    overrides: Optional[Dict[str, str]],
    allow_manual: bool,
) -> Dict[str, SpeakerGenderProfile]:
    if not overrides or not allow_manual:
        return profiles
    out = dict(profiles)
    for sid, raw in overrides.items():
        g = raw.lower().strip()
        if g not in ("male", "female", "unknown"):
            continue
        out[sid] = SpeakerGenderProfile(sid, g, 1.0, "manual")  # type: ignore[arg-type]
    return out


def normalize_speaker_profile_overrides(
    profile_overrides: Optional[Dict[str, Dict[str, str]]],
    gender_overrides: Optional[Dict[str, str]],
) -> Dict[str, Dict[str, str]]:
    """Merge legacy gender-only overrides into profile override dict."""
    merged: Dict[str, Dict[str, str]] = {}
    if profile_overrides:
        for sid, profile in profile_overrides.items():
            if not isinstance(profile, dict):
                continue
            entry = {k: str(v) for k, v in profile.items() if v is not None and str(v).strip()}
            if entry:
                merged[sid] = entry
    if gender_overrides:
        for sid, raw in gender_overrides.items():
            g = str(raw).lower().strip()
            if g not in ("male", "female", "unknown"):
                continue
            merged.setdefault(sid, {})["gender"] = g
    return merged


def profiles_to_registry_dict(
    profiles: Dict[str, SpeakerGenderProfile],
    overrides: Optional[Dict[str, Dict[str, str]]],
    allow_manual: bool,
) -> Dict[str, Dict[str, object]]:
    """Convert classifier profiles + manual overrides to export registry entries."""
    gender_only: Optional[Dict[str, str]] = None
    if overrides and allow_manual:
        gender_only = {
            sid: str(ov["gender"])
            for sid, ov in overrides.items()
            if ov.get("gender")
        }
    merged = apply_gender_overrides(profiles, gender_only, allow_manual)

    out: Dict[str, Dict[str, object]] = {}
    for sid, profile in merged.items():
        entry: Dict[str, object] = {
            "id": profile.speaker_id,
            "gender": profile.gender,
            "gender_confidence": profile.confidence,
            "gender_source": profile.source,
        }
        role = (overrides or {}).get(sid, {}).get("suggested_role")
        if role and str(role).strip():
            entry["suggested_role"] = str(role).strip()
        out[sid] = entry

    if overrides and allow_manual:
        for sid, ov in overrides.items():
            if sid in out:
                continue
            role = ov.get("suggested_role")
            if not role or not str(role).strip():
                continue
            raw_g = str(ov.get("gender", "unknown")).lower().strip()
            gender = raw_g if raw_g in ("male", "female", "unknown") else "unknown"
            out[sid] = {
                "id": sid,
                "gender": gender,
                "gender_confidence": 1.0 if ov.get("gender") else 0.0,
                "gender_source": "manual" if ov.get("gender") else "stub",
                "suggested_role": str(role).strip(),
            }
    return out
