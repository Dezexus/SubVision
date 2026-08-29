"""PyAnnote speaker diarization with stub fallback."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from subvision.core.config import settings
from subvision.domain.emotion_models import DiarizationSettings

logger = logging.getLogger(__name__)

_PYANNOTE_AVAILABLE: Optional[bool] = None


def pyannote_available() -> bool:
    global _PYANNOTE_AVAILABLE
    if _PYANNOTE_AVAILABLE is None:
        try:
            from pyannote.audio import Pipeline  # noqa: F401

            _PYANNOTE_AVAILABLE = True
        except ImportError:
            _PYANNOTE_AVAILABLE = False
    return _PYANNOTE_AVAILABLE


@dataclass
class SpeakerSegment:
    start: float
    end: float
    speaker_id: str


class DiarizationEngine:
    def __init__(self, cfg: DiarizationSettings) -> None:
        self.cfg = cfg
        self._pipeline = None

    def _load_pipeline(self) -> None:
        if self._pipeline is not None:
            return
        if not pyannote_available() or not settings.hf_token:
            logger.info("pyannote unavailable or HF_TOKEN missing — stub diarization")
            self._pipeline = "stub"
            return
        from pyannote.audio import Pipeline

        self._pipeline = Pipeline.from_pretrained(
            self.cfg.model_id,
            use_auth_token=settings.hf_token,
        )
        device = self.cfg.inference_device
        if device == "cuda":
            import torch

            if torch.cuda.is_available():
                self._pipeline.to(torch.device("cuda"))

    def diarize(self, wav_path: Path, duration: float) -> List[SpeakerSegment]:
        self._load_pipeline()
        if self._pipeline == "stub":
            return _stub_segments(duration, self.cfg)
        kwargs: Dict[str, object] = {}
        if self.cfg.num_speakers is not None:
            kwargs["num_speakers"] = self.cfg.num_speakers
        else:
            kwargs["min_speakers"] = self.cfg.min_speakers
            kwargs["max_speakers"] = self.cfg.max_speakers
        diar = self._pipeline(str(wav_path), **kwargs)
        segments: List[SpeakerSegment] = []
        for turn, _, speaker in diar.itertracks(yield_label=True):
            seg_len = float(turn.end - turn.start)
            if seg_len < self.cfg.min_segment_duration_sec:
                continue
            sid = f"{self.cfg.speaker_id_prefix}{speaker}"
            segments.append(SpeakerSegment(float(turn.start), float(turn.end), sid))
        return segments


def map_cue_to_speaker(
    cue_start: float,
    cue_end: float,
    segments: List[SpeakerSegment],
    cfg: DiarizationSettings,
) -> Tuple[Optional[str], List[str]]:
    """Map subtitle cue to speaker id(s)."""
    if not segments:
        return None, []
    cue_len = max(cue_end - cue_start, 1e-6)
    overlaps: List[Tuple[str, float]] = []
    center = (cue_start + cue_end) / 2.0

    for seg in segments:
        overlap_start = max(cue_start, seg.start)
        overlap_end = min(cue_end, seg.end)
        overlap = max(0.0, overlap_end - overlap_start)
        if overlap <= 0:
            if cfg.cue_speaker_strategy == "center_time" and seg.start <= center <= seg.end:
                overlaps.append((seg.speaker_id, 0.01))
            continue
        overlaps.append((seg.speaker_id, overlap / cue_len))

    if not overlaps:
        return None, []

    if cfg.cue_speaker_strategy == "center_time":
        for seg in segments:
            if seg.start <= center <= seg.end:
                return seg.speaker_id, [seg.speaker_id]

    best = max(overlaps, key=lambda x: x[1])
    if best[1] < cfg.min_overlap_ratio:
        return None, []

    if cfg.allow_multi_speaker_cue:
        ids = sorted({sid for sid, ratio in overlaps if ratio >= cfg.min_overlap_ratio})
        return ids[0] if ids else None, ids

    return best[0], [best[0]]


def _stub_segments(duration: float, cfg: DiarizationSettings) -> List[SpeakerSegment]:
    """Alternate speakers every 30s for stub."""
    if duration <= 0:
        return [SpeakerSegment(0.0, 1.0, f"{cfg.speaker_id_prefix}00")]
    segments: List[SpeakerSegment] = []
    step = 30.0
    t = 0.0
    idx = 0
    while t < duration:
        end = min(t + step, duration)
        segments.append(
            SpeakerSegment(t, end, f"{cfg.speaker_id_prefix}{idx:02d}")
        )
        t = end
        idx = (idx + 1) % max(cfg.min_speakers, 2)
    return segments
