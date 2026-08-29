"""Tests for multimodal emotion fusion."""

from subvision.processing.emotion_fusion import fuse_multimodal_emotion
from subvision.processing.text_sentiment_engine import TextSentimentResult


def test_fusion_corrects_false_happiness_on_negative_text():
    block = {
        "primary": "happiness",
        "confidence": 0.756,
        "probs": {
            "anger": 0.24,
            "sadness": 0.001,
            "neutral": 0.003,
            "happiness": 0.756,
        },
    }
    ts = TextSentimentResult("negative", 0.82, "auto", "en")
    fused = fuse_multimodal_emotion(block, intensity=0.94, text_sentiment=ts)
    assert fused is not None
    assert fused["primary"] == "anger"
    assert fused.get("fusion_applied") is True


def test_fusion_keeps_happiness_when_low_intensity():
    block = {
        "primary": "happiness",
        "confidence": 0.8,
        "probs": {"anger": 0.1, "sadness": 0.05, "neutral": 0.05, "happiness": 0.8},
    }
    ts = TextSentimentResult("negative", 0.9, "auto", "en")
    fused = fuse_multimodal_emotion(block, intensity=0.3, text_sentiment=ts)
    assert fused["primary"] == "happiness"
