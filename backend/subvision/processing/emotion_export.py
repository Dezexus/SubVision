"""Orchestrate emotion + speaker export pipeline."""

from __future__ import annotations

import json
import logging
import os
import shutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import redis

from subvision.core.audio_io import clamp_cue_window, extract_audio_segment, extract_full_audio_wav
from subvision.core.config import settings
from subvision.core.config_merge import settings_hash
from subvision.domain.emotion_models import EmotionAnalysisSettings
from subvision.processing.diarization_engine import DiarizationEngine, map_cue_to_speaker
from subvision.processing.emotion_engine import EmotionEngine, postprocess_emotion
from subvision.processing.emotion_json_format import (
    build_structured_cue,
    speakers_list_from_profiles,
    speakers_registry_from_profiles,
    wav_rms_intensity,
)
from subvision.processing.emotion_fusion import fuse_multimodal_emotion
from subvision.processing.gender_engine import (
    GenderEngine,
    normalize_speaker_profile_overrides,
    profiles_to_registry_dict,
)
from subvision.processing.text_sentiment_engine import TextSentimentEngine

logger = logging.getLogger(__name__)


def _video_duration(video_path: str) -> Optional[float]:
    try:
        import av

        with av.open(video_path) as container:
            if container.duration is not None:
                return float(container.duration) / float(av.time_base)
            stream = container.streams.audio[0] if container.streams.audio else container.streams.video[0]
            if stream.duration is not None and stream.time_base is not None:
                return float(stream.duration * stream.time_base)
    except Exception as exc:
        logger.debug("duration probe failed: %s", exc)
    return None


def _cache_get(redis_client: Optional[redis.Redis], key: str) -> Optional[Dict[str, Any]]:
    if not redis_client:
        return None
    raw = redis_client.get(key)
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if isinstance(data, dict) and "probs" in data:
        return data
    if isinstance(data, dict):
        return {"probs": data}
    return None


def _cache_set(
    redis_client: Optional[redis.Redis],
    key: str,
    probs: Dict[str, float],
    ttl: int,
    intensity: Optional[float] = None,
) -> None:
    if not redis_client:
        return
    payload: Dict[str, Any] = {"probs": probs}
    if intensity is not None:
        payload["intensity"] = intensity
    redis_client.setex(key, ttl, json.dumps(payload))


def run_emotion_export(
    video_path: str,
    subtitles: List[Dict[str, Any]],
    analysis: EmotionAnalysisSettings,
    output_path: Path,
    *,
    filename: str,
    progress_cb: Optional[Callable[[int, int, str], None]] = None,
    cancel_check: Optional[Callable[[], bool]] = None,
    redis_client: Optional[redis.Redis] = None,
    speaker_gender_overrides: Optional[Dict[str, str]] = None,
    speaker_profile_overrides: Optional[Dict[str, Dict[str, str]]] = None,
    original_filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Build JSON sidecar and write to output_path."""
    cfg = analysis.export
    if not cfg.enabled:
        raise ValueError("Emotion export is disabled")

    if len(subtitles) > cfg.max_cues_per_job:
        raise ValueError(f"Too many cues ({len(subtitles)} > {cfg.max_cues_per_job})")

    duration = _video_duration(video_path)
    diar_segments = []
    diar_timeline: List[Dict[str, Any]] = []

    if analysis.export.analyze_speakers and analysis.diarization.enabled:
        full_wav = extract_full_audio_wav(video_path, cfg)
        if full_wav:
            try:
                engine = DiarizationEngine(analysis.diarization)
                diar_segments = engine.diarize(full_wav, duration or 0.0)
                diar_timeline = [
                    {"start": s.start, "end": s.end, "speaker_id": s.speaker_id}
                    for s in diar_segments
                ]
            finally:
                if full_wav.exists():
                    full_wav.unlink(missing_ok=True)

    unique_speaker_ids = sorted({s.speaker_id for s in diar_segments})
    profile_overrides = normalize_speaker_profile_overrides(
        speaker_profile_overrides,
        speaker_gender_overrides,
    )
    gender_profiles: Dict[str, Any] = {}
    if analysis.gender.enabled and unique_speaker_ids:
        gender_engine = GenderEngine(analysis.gender, cfg)
        raw_profiles = gender_engine.classify_speakers(video_path, diar_segments, unique_speaker_ids)
        gender_profiles = profiles_to_registry_dict(
            raw_profiles,
            profile_overrides or None,
            analysis.gender.allow_manual_override,
        )
    elif profile_overrides and analysis.gender.allow_manual_override:
        gender_profiles = profiles_to_registry_dict(
            {},
            profile_overrides,
            True,
        )

    text_sentiment_engine: Optional[TextSentimentEngine] = None
    if analysis.text_sentiment.enabled:
        text_sentiment_engine = TextSentimentEngine(analysis.text_sentiment)

    emotion_engine = EmotionEngine(cfg)
    s_hash = settings_hash(analysis) if cfg.cache_key_include_settings else "default"
    cues_out: List[Dict[str, Any]] = []
    total = len(subtitles)
    speakers_seen: set[str] = set()

    for idx, sub in enumerate(subtitles):
        if cancel_check and cancel_check():
            raise RuntimeError("Task Cancelled")

        cue_id = sub.get("id", idx + 1)
        start = float(sub["start"])
        end = float(sub["end"])
        text = sub.get("text", "")
        conf = float(sub.get("conf", 1.0))

        win_start, win_end, skip, skip_reason = clamp_cue_window(start, end, cfg, duration)

        speaker_id: Optional[str] = None
        speaker_ids: List[str] = []
        if diar_segments:
            speaker_id, speaker_ids = map_cue_to_speaker(start, end, diar_segments, analysis.diarization)
            if speaker_id:
                speakers_seen.add(speaker_id)

        emotion_block: Optional[Dict[str, Any]] = None
        intensity: Optional[float] = None
        text_sentiment_result = None
        if not skip and cfg.analyze_emotion:
            cache_key = f"emotion:cache:{filename}:{start:.3f}:{end:.3f}:{s_hash}"
            cached = _cache_get(redis_client, cache_key) if cfg.use_cache else None
            probs = cached.get("probs") if cached else None
            if cached and analysis.json_format.include_audio_intensity:
                intensity = cached.get("intensity")

            need_wav = probs is None or (
                analysis.json_format.include_audio_intensity and intensity is None
            )
            if need_wav:
                wav = extract_audio_segment(video_path, win_start, win_end, cfg)
                if wav is None:
                    skip = True
                    skip_reason = skip_reason or "extract_failed"
                else:
                    try:
                        if probs is None:
                            probs = emotion_engine.analyze_wav(wav)
                        if analysis.json_format.include_audio_intensity and intensity is None:
                            intensity = wav_rms_intensity(wav)
                        if cfg.use_cache and probs:
                            _cache_set(
                                redis_client,
                                cache_key,
                                probs,
                                cfg.cache_ttl_sec,
                                intensity=intensity,
                            )
                    finally:
                        if wav.exists():
                            wav.unlink(missing_ok=True)
            if probs and not skip:
                emotion_block = postprocess_emotion(probs, cfg)
        elif skip and skip_reason == "too_short":
            pass

        if (
            text_sentiment_engine
            and text.strip()
        ):
            text_sentiment_result = text_sentiment_engine.analyze(text)

        if (
            emotion_block
            and analysis.text_sentiment.multimodal_fusion_enabled
            and text_sentiment_result
        ):
            emotion_block = fuse_multimodal_emotion(
                emotion_block,
                intensity=intensity,
                text_sentiment=text_sentiment_result,
            )

        if skip and not analysis.json_format.include_skipped_cues:
            continue

        speaker_gender_val: Optional[str] = None
        if speaker_id and speaker_id in gender_profiles:
            speaker_gender_val = str(gender_profiles[speaker_id].get("gender"))

        text_sentiment_block: Optional[Dict[str, Any]] = None
        if (
            text_sentiment_result
            and analysis.text_sentiment.include_in_json
        ):
            text_sentiment_block = {
                "label": text_sentiment_result.sentiment,
                "score": round(text_sentiment_result.confidence, 3),
                "language": text_sentiment_result.language,
            }

        jfmt = analysis.json_format
        use_v3 = jfmt.schema_version >= 3

        if use_v3:
            entry = build_structured_cue(
                cue_id=cue_id,
                start=start,
                end=end,
                text=text,
                ocr_conf=conf,
                speaker_id=speaker_id,
                speaker_ids=speaker_ids,
                speaker_gender=speaker_gender_val,
                emotion_block=emotion_block if isinstance(emotion_block, dict) else None,
                intensity=intensity,
                text_sentiment=text_sentiment_block,
                skipped=skip,
                skip_reason=skip_reason,
                fmt=jfmt,
                allow_multi_speaker=analysis.diarization.allow_multi_speaker_cue,
            )
            if not jfmt.include_translations_block:
                entry.pop("translations", None)
        else:
            entry = {
                "id": cue_id,
                "start": start,
                "end": end,
            }
            if jfmt.include_ocr_text:
                entry["text"] = text
            if jfmt.include_ocr_conf:
                entry["conf"] = conf
            if jfmt.include_speaker_id:
                if analysis.diarization.allow_multi_speaker_cue and speaker_ids:
                    entry["speaker_ids"] = speaker_ids
                entry["speaker_id"] = speaker_id
            if jfmt.include_speaker_gender and speaker_gender_val:
                entry["speaker_gender"] = speaker_gender_val
            entry["emotion"] = emotion_block
            entry["skipped"] = skip
            entry["skip_reason"] = skip_reason if skip else None

        cues_out.append(entry)

        if progress_cb and (idx + 1) % max(cfg.progress_every_n_cues, 1) == 0:
            progress_cb(idx + 1, total, "...")

    analyzed_at = datetime.now(timezone.utc).isoformat() if analysis.json_format.datetime_utc else None
    speakers_count = len(speakers_seen) if speakers_seen else len({s.speaker_id for s in diar_segments})
    jfmt = analysis.json_format

    if jfmt.schema_version >= 3:
        metadata: Dict[str, Any] = {
            "media_file": original_filename or filename,
            "storage_file": filename,
            "analyzed_at": analyzed_at,
            "emotion_labels": cfg.labels,
            "model_label_map": cfg.label_map,
            "speakers_count": speakers_count,
        }
        if gender_profiles and analysis.gender.include_in_json:
            metadata["speakers"] = speakers_registry_from_profiles(gender_profiles)
        if jfmt.include_settings_snapshot:
            metadata["config"] = analysis.to_effective_dict()
        payload: Dict[str, Any] = {
            "version": jfmt.schema_version,
            "metadata": metadata,
            "cues": cues_out,
        }
        if gender_profiles and analysis.gender.include_in_json:
            payload["speakers"] = speakers_list_from_profiles(gender_profiles)
    else:
        payload = {
            "version": jfmt.schema_version,
            "labels": cfg.labels,
            "speakers_detected": speakers_count,
            "cues": cues_out,
        }
        if gender_profiles and analysis.gender.include_in_json:
            payload["speakers"] = list(gender_profiles.values())
        if jfmt.include_source_block:
            payload["source"] = {
                "filename": filename,
                "analyzed_at": analyzed_at,
            }
            if jfmt.include_settings_snapshot:
                payload["source"]["settings_snapshot"] = analysis.to_effective_dict()

    if jfmt.include_diarization_timeline:
        payload["diarization_timeline"] = diar_timeline

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        if analysis.json_format.pretty_print:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
        else:
            json.dump(payload, fh, ensure_ascii=False)

    return payload
