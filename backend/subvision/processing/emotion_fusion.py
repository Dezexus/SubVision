"""Multimodal correction for false-positive GigaAM happiness tags."""

from __future__ import annotations

from typing import Any, Dict, Optional

from subvision.processing.text_sentiment_engine import TextSentimentResult

INTENSITY_THRESHOLD = 0.65
MIN_ANGER_PROB = 0.15
TEXT_NEG_CONFIDENCE = 0.45


def fuse_multimodal_emotion(
    emotion_block: Optional[Dict[str, Any]],
    *,
    intensity: Optional[float],
    text_sentiment: Optional[TextSentimentResult],
) -> Optional[Dict[str, Any]]:
    """Down-rank happiness when high arousal conflicts with text or anger probs."""
    if not emotion_block or emotion_block.get("primary") != "happiness":
        return emotion_block

    probs = dict(emotion_block.get("probs") or {})
    if not probs:
        return emotion_block

    anger_p = float(probs.get("anger", 0.0))
    happy_p = float(probs.get("happiness", emotion_block.get("confidence", 0.0)))
    high_intensity = intensity is not None and intensity >= INTENSITY_THRESHOLD

    reason: Optional[str] = None
    if high_intensity and text_sentiment:
        if text_sentiment.sentiment == "negative" and text_sentiment.confidence >= TEXT_NEG_CONFIDENCE:
            reason = "high_intensity_negative_text"
        elif text_sentiment.sentiment == "neutral" and anger_p >= MIN_ANGER_PROB:
            reason = "high_intensity_neutral_text_anger_secondary"
    elif high_intensity and anger_p >= MIN_ANGER_PROB:
        reason = "high_intensity_anger_secondary"

    if not reason or anger_p <= 0:
        return emotion_block

    adjusted = dict(probs)
    adjusted["anger"] = min(1.0, anger_p + happy_p * 0.45)
    adjusted["happiness"] = max(0.0, happy_p * 0.45)
    total = sum(adjusted.values()) or 1.0
    normalized = {k: round(v / total, 6) for k, v in adjusted.items()}
    primary = max(normalized, key=normalized.get)
    confidence = normalized[primary]

    if primary == emotion_block["primary"]:
        return emotion_block

    return {
        **emotion_block,
        "primary": primary,
        "confidence": confidence,
        "probs": normalized,
        "fusion_applied": True,
        "fusion_reason": reason,
    }
