"""Tests for emotion JSON formatting helpers."""

from subvision.domain.emotion_models import EmotionExportSettings, EmotionJsonFormatSettings
from subvision.processing.emotion_json_format import (
    build_structured_cue,
    chars_per_second,
    detect_text_language,
    format_srt_range,
    format_srt_timestamp,
    speakers_list_from_profiles,
    speakers_registry_from_profiles,
)
from subvision.processing.emotion_engine import postprocess_emotion


def test_format_srt_timestamp():
    assert format_srt_timestamp(137.066) == "00:02:17,066"


def test_format_srt_range():
    assert format_srt_range(137.066, 138.866) == "00:02:17,066 --> 00:02:18,866"


def test_chars_per_second():
    assert chars_per_second("SKY-BREAK!", 1.8) == 5.56


def test_detect_text_language():
    assert detect_text_language("Protect Xuanfang!") == "en"
    assert detect_text_language("Защитите Сюаньфан!") == "ru"


def test_postprocess_maps_positive_to_happiness():
    cfg = EmotionExportSettings()
    result = postprocess_emotion(
        {"angry": 0.1, "sad": 0.1, "neutral": 0.1, "positive": 0.7},
        cfg,
    )
    assert result["primary"] == "happiness"
    assert result["probs"]["happiness"] == 0.7
    assert "positive" not in result["probs"]


def test_build_structured_cue_flat_with_flags():
    fmt = EmotionJsonFormatSettings()
    cue = build_structured_cue(
        cue_id=9,
        start=137.066,
        end=138.866,
        text="SKY-BREAK!",
        ocr_conf=1.0,
        speaker_id="SPEAKER_00",
        speaker_ids=["SPEAKER_00"],
        speaker_gender="unknown",
        emotion_block={
            "primary": "happiness",
            "confidence": 0.755657,
            "probs": {
                "anger": 0.239783,
                "sadness": 0.001306,
                "neutral": 0.003254,
                "happiness": 0.755657,
            },
        },
        intensity=0.94,
        text_sentiment={"label": "neutral", "score": 0.82, "language": "en"},
        skipped=False,
        skip_reason=None,
        fmt=fmt,
        allow_multi_speaker=False,
    )
    assert cue["duration"] == 1.8
    assert cue["timecode"] == "00:02:17,066 --> 00:02:18,866"
    assert cue["chars_per_second"] == 5.56
    assert cue["audio_intensity"] == 0.94
    assert cue["emotion"]["primary"] == "happiness"
    assert cue["text_sentiment"]["label"] == "neutral"
    assert "translations" not in cue


def test_build_structured_cue_respects_disabled_flags():
    fmt = EmotionJsonFormatSettings(
        include_timing_details=False,
        include_readability_metrics=False,
        include_audio_intensity=False,
    )
    cue = build_structured_cue(
        cue_id=1,
        start=0.0,
        end=1.0,
        text="hello",
        ocr_conf=0.9,
        speaker_id=None,
        speaker_ids=[],
        speaker_gender=None,
        emotion_block=None,
        intensity=0.5,
        text_sentiment=None,
        skipped=False,
        skip_reason=None,
        fmt=fmt,
        allow_multi_speaker=False,
    )
    assert "start" not in cue
    assert "chars_per_second" not in cue
    assert "audio_intensity" not in cue


def test_speakers_list_from_profiles():
    items = speakers_list_from_profiles({
        "SPEAKER_00": {
            "gender": "female",
            "gender_confidence": 0.9,
            "gender_source": "manual",
            "suggested_role": "Anna",
        },
    })
    assert items[0]["id"] == "SPEAKER_00"
    assert items[0]["suggested_role"] == "Anna"


def test_speakers_registry_includes_suggested_role():
    registry = speakers_registry_from_profiles({
        "SPEAKER_00": {
            "gender": "female",
            "gender_confidence": 0.9,
            "gender_source": "manual",
            "suggested_role": "Anna",
        },
    })
    assert registry["SPEAKER_00"]["suggested_role"] == "Anna"
