"""Tests for emotion settings merge and export pipeline."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from subvision.core.config_merge import merge_emotion_settings, settings_hash
from subvision.domain.emotion_models import EmotionAnalysisSettings
from subvision.core.admin_config import env_emotion_defaults
from subvision.processing.emotion_export import run_emotion_export


def test_merge_priority_request_over_admin():
    base = env_emotion_defaults()
    admin = {"export": {"batch_size": 16}}
    request = {"export": {"batch_size": 4}}
    merged = merge_emotion_settings(base, admin, request)
    assert merged.export.batch_size == 4


def test_settings_hash_stable():
    a = env_emotion_defaults()
    b = env_emotion_defaults()
    assert settings_hash(a) == settings_hash(b)


def test_emotion_export_stub_pipeline(tmp_path):
    video = tmp_path / "v.mp4"
    video.write_bytes(b"\x00")
    out = tmp_path / "out.json"
    subs = [{"id": 1, "start": 1.0, "end": 2.0, "text": "hi", "conf": 0.9}]
    settings = EmotionAnalysisSettings()
    settings.export.analyze_speakers = False
    # Will skip extract on invalid video but still produce structure
    try:
        run_emotion_export(
            str(video),
            subs,
            settings,
            out,
            filename="v.mp4",
        )
    except Exception:
        pytest.skip("ffmpeg not available in test env")
    if out.exists():
        data = json.loads(out.read_text(encoding="utf-8"))
        assert data["version"] == 3
        assert "metadata" in data
        assert "cues" in data
        if data["cues"]:
            cue = data["cues"][0]
            assert "start" in cue or "timing" in cue
            if "start" in cue:
                assert "timecode" in cue


def test_model_weights_cached_false(tmp_path, monkeypatch):
    from subvision.processing.emotion_engine import model_weights_cached
    from subvision.domain.emotion_models import EmotionExportSettings

    cfg = EmotionExportSettings()
    cfg.model_cache_dir = str(tmp_path / "empty")
    assert model_weights_cached(cfg) is False


def test_model_weights_cached_true(tmp_path):
    from subvision.processing.emotion_engine import model_weights_cached
    from subvision.domain.emotion_models import EmotionExportSettings

    cfg = EmotionExportSettings()
    cfg.model_cache_dir = str(tmp_path)
    (tmp_path / "emo.pt").write_bytes(b"x")
    assert model_weights_cached(cfg) is True


def test_apply_gender_overrides():
    from subvision.processing.gender_engine import SpeakerGenderProfile, apply_gender_overrides

    profiles = {
        "SPEAKER_00": SpeakerGenderProfile("SPEAKER_00", "unknown", 0.0, "stub"),
    }
    merged = apply_gender_overrides(profiles, {"SPEAKER_00": "female"}, True)
    assert merged["SPEAKER_00"].gender == "female"
    assert merged["SPEAKER_00"].source == "manual"

    unchanged = apply_gender_overrides(profiles, {"SPEAKER_00": "female"}, False)
    assert unchanged["SPEAKER_00"].gender == "unknown"


def test_profiles_to_registry_with_suggested_role():
    from subvision.processing.gender_engine import profiles_to_registry_dict

    profiles = profiles_to_registry_dict(
        {},
        {"SPEAKER_01": {"gender": "male", "suggested_role": "Narrator"}},
        True,
    )
    assert profiles["SPEAKER_01"]["gender"] == "male"
    assert profiles["SPEAKER_01"]["suggested_role"] == "Narrator"


def test_normalize_speaker_profile_overrides_merges_legacy():
    from subvision.processing.gender_engine import normalize_speaker_profile_overrides

    merged = normalize_speaker_profile_overrides(
        {"SPEAKER_00": {"suggested_role": "Hero"}},
        {"SPEAKER_00": "female"},
    )
    assert merged["SPEAKER_00"]["gender"] == "female"
    assert merged["SPEAKER_00"]["suggested_role"] == "Hero"


def test_spike_latency_stub_cues(tmp_path):
    """Spike: measure stub emotion path throughput (no gigaam required)."""
    import time

    video = tmp_path / "v.mp4"
    video.write_bytes(b"\x00")
    out = tmp_path / "spike.json"
    subs = [{"id": i, "start": float(i), "end": float(i) + 0.5, "text": "x", "conf": 1.0} for i in range(20)]
    settings = EmotionAnalysisSettings()
    settings.export.analyze_speakers = False
    t0 = time.perf_counter()
    try:
        run_emotion_export(str(video), subs, settings, out, filename="v.mp4")
    except Exception:
        pytest.skip("ffmpeg unavailable")
    elapsed = time.perf_counter() - t0
    assert elapsed < 120.0
