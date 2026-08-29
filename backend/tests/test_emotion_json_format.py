"""Tests for emotion JSON formatting helpers."""

from subvision.domain.emotion_models import EmotionJsonFormatSettings
from subvision.processing.emotion_json_format import (
    build_structured_cue,
    chars_per_second,
    format_srt_range,
    format_srt_timestamp,
    speakers_registry_from_profiles,
)
from subvision.processing.emotion_engine import postprocess_emotion
from subvision.domain.emotion_models import EmotionExportSettings


def test_format_srt_timestamp():
    assert format_srt_timestamp(137.066) == "00:02:17,066"


def test_format_srt_range():
    assert format_srt_range(137.066, 138.866) == "00:02:17,066 --> 00:02:18,866"


def test_chars_per_second():
    assert chars_per_second("SKY-BREAK!", 1.8) == 5.56


def test_postprocess_maps_positive_to_happiness():
    cfg = EmotionExportSettings()
    result = postprocess_emotion(
        {"angry": 0.1, "sad": 0.1, "neutral": 0.1, "positive": 0.7},
        cfg,
    )
    assert result["primary"] == "happiness"
    assert result["probs"]["happiness"] == 0.7
    assert "positive" not in result["probs"]


def test_build_structured_cue_no_translations_by_default():
    fmt = EmotionJsonFormatSettings()
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
        intensity=None,
        text_analysis=None,
        skipped=False,
        skip_reason=None,
        fmt=fmt,
        allow_multi_speaker=False,
    )
    assert "translations" not in cue


def test_build_structured_cue_with_text_analysis():
    fmt = EmotionJsonFormatSettings()
    cue = build_structured_cue(
        cue_id=1,
        start=0.0,
        end=1.0,
        text="hello",
        ocr_conf=0.9,
        speaker_id="SPEAKER_00",
        speaker_ids=["SPEAKER_00"],
        speaker_gender="female",
        emotion_block=None,
        intensity=None,
        text_analysis={"sentiment": "positive", "confidence": 0.8},
        skipped=False,
        skip_reason=None,
        fmt=fmt,
        allow_multi_speaker=False,
    )
    assert cue["text_analysis"]["sentiment"] == "positive"
    assert cue["speaker_gender"] == "female"


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
