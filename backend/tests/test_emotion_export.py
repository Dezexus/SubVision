"""Tests for emotion settings merge and export pipeline."""

from __future__ import annotations

import json

import pytest

from subvision.core.admin_config import env_emotion_defaults
from subvision.core.config_merge import merge_emotion_settings, settings_hash
from subvision.domain.emotion_models import EmotionAnalysisSettings, EmotionExportSettings
from subvision.processing.emotion_engine import EmotionEngine
from subvision.processing.emotion_export import run_emotion_export


def test_merge_priority_request_over_admin():
    base = env_emotion_defaults()
    admin = {"export": {"confidence_threshold": 0.7}}
    request = {"export": {"confidence_threshold": 0.4}}
    merged = merge_emotion_settings(base, admin, request)
    assert merged.export.confidence_threshold == 0.4


def test_settings_hash_stable():
    a = env_emotion_defaults()
    b = env_emotion_defaults()
    assert settings_hash(a) == settings_hash(b)


def test_emotion_export_pipeline(tmp_path, monkeypatch):
    video = tmp_path / "v.mp4"
    video.write_bytes(b"\x00")
    wav = tmp_path / "segment.wav"
    out = tmp_path / "out.json"
    subs = [{"id": 1, "start": 1.0, "end": 2.0, "text": "hi", "conf": 0.9}]

    class FakeEngine:
        def analyze_wav(self, _wav_path):
            return {"anger": 0.1, "sadness": 0.1, "neutral": 0.2, "happiness": 0.6}

    def fake_extract(*_args):
        wav.write_bytes(b"RIFF" + b"\x00" * 44)
        return wav

    monkeypatch.setattr("subvision.processing.emotion_export._video_duration", lambda _path: 10.0)
    monkeypatch.setattr("subvision.processing.emotion_export.extract_audio_segment", fake_extract)
    monkeypatch.setattr("subvision.processing.emotion_export.get_engine_for_config", lambda _cfg: FakeEngine())
    monkeypatch.setattr("subvision.processing.emotion_export.wav_rms_intensity", lambda _path: 0.5)

    run_emotion_export(str(video), subs, EmotionAnalysisSettings(), out, filename="v.mp4")

    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["version"] == 3
    assert data["cues"][0]["emotion"]["primary"] == "happiness"
    assert not wav.exists()


def test_emotion_analysis_requires_gigaam(monkeypatch, tmp_path):
    monkeypatch.setattr("subvision.processing.emotion_engine.gigaam_available", lambda: False)
    engine = EmotionEngine(EmotionExportSettings())
    with pytest.raises(RuntimeError, match="GigaAM is not installed"):
        engine.analyze_wav(tmp_path / "segment.wav")


def test_export_without_audio_analysis_does_not_load_engine(tmp_path, monkeypatch):
    out = tmp_path / "out.json"
    settings = EmotionAnalysisSettings()
    settings.export.analyze_emotion = False
    monkeypatch.setattr(
        "subvision.processing.emotion_export.get_engine_for_config",
        lambda _cfg: pytest.fail("emotion engine must not be loaded"),
    )

    payload = run_emotion_export(
        str(tmp_path / "v.mp4"),
        [{"id": 1, "start": 1.0, "end": 2.0, "text": "hi", "conf": 0.9}],
        settings,
        out,
        filename="v.mp4",
    )
    assert "emotion" not in payload["cues"][0]


def test_model_weights_cached_false(tmp_path):
    from subvision.processing.emotion_engine import model_weights_cached

    cfg = EmotionExportSettings(model_cache_dir=str(tmp_path / "empty"))
    assert model_weights_cached(cfg) is False


def test_model_weights_cached_true(tmp_path):
    from subvision.processing.emotion_engine import model_weights_cached

    cfg = EmotionExportSettings(model_cache_dir=str(tmp_path))
    (tmp_path / "emo.pt").write_bytes(b"x")
    assert model_weights_cached(cfg) is True
