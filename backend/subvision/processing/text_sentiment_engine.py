"""Local text sentiment (optional HF transformers + stub)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal, Optional

from subvision.domain.emotion_models import TextSentimentSettings

logger = logging.getLogger(__name__)

_TRANSFORMERS_AVAILABLE: Optional[bool] = None
SentimentLabel = Literal["positive", "negative", "neutral"]


def sentiment_model_available() -> bool:
    global _TRANSFORMERS_AVAILABLE
    if _TRANSFORMERS_AVAILABLE is None:
        try:
            import transformers  # noqa: F401

            _TRANSFORMERS_AVAILABLE = True
        except ImportError:
            _TRANSFORMERS_AVAILABLE = False
    return _TRANSFORMERS_AVAILABLE


@dataclass
class TextSentimentResult:
    sentiment: SentimentLabel
    confidence: float
    source: Literal["auto", "stub"]


class TextSentimentEngine:
    def __init__(self, cfg: TextSentimentSettings) -> None:
        self.cfg = cfg
        self._pipeline = None

    def _load_pipeline(self) -> None:
        if self._pipeline is not None:
            return
        if not sentiment_model_available():
            self._pipeline = "stub"
            return
        try:
            from transformers import pipeline

            self._pipeline = pipeline(
                "sentiment-analysis",
                model=self.cfg.model_id,
                device=-1,
            )
        except Exception as exc:
            logger.warning("Text sentiment model load failed, using stub: %s", exc)
            self._pipeline = "stub"

    def _map_label(self, raw: str) -> SentimentLabel:
        label = raw.lower().strip()
        if "pos" in label or label in ("label_2", "2"):
            return "positive"
        if "neg" in label or label in ("label_0", "0"):
            return "negative"
        return "neutral"

    def analyze(self, text: str) -> TextSentimentResult:
        cleaned = (text or "").strip()
        if not cleaned:
            return TextSentimentResult("neutral", 0.0, "stub")

        self._load_pipeline()
        if self._pipeline == "stub":
            return TextSentimentResult("neutral", 0.0, "stub")

        try:
            result = self._pipeline(cleaned[:512])
            if not result:
                return TextSentimentResult("neutral", 0.0, "stub")
            top = result[0]
            sentiment = self._map_label(str(top.get("label", "")))
            score = float(top.get("score", 0.0))
            if score < self.cfg.confidence_threshold:
                return TextSentimentResult("neutral", score, "auto")
            return TextSentimentResult(sentiment, score, "auto")
        except Exception as exc:
            logger.debug("text sentiment failed: %s", exc)
            return TextSentimentResult("neutral", 0.0, "stub")
