"""Tests for text sentiment engine stub path."""

from subvision.domain.emotion_models import TextSentimentSettings
from subvision.processing.text_sentiment_engine import TextSentimentEngine


def test_text_sentiment_stub_returns_neutral():
    engine = TextSentimentEngine(TextSentimentSettings(enabled=True))
    result = engine.analyze("Привет, мир!")
    assert result.sentiment == "neutral"
    assert result.source == "stub"


def test_text_sentiment_empty_text():
    engine = TextSentimentEngine(TextSentimentSettings())
    result = engine.analyze("   ")
    assert result.sentiment == "neutral"
    assert result.confidence == 0.0
