"""Local text sentiment (optional HF transformers + stub)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Literal, Optional

from subvision.domain.emotion_models import TextSentimentSettings
from subvision.processing.emotion_json_format import detect_text_language

logger = logging.getLogger(__name__)

_TRANSFORMERS_AVAILABLE: Optional[bool] = None
SentimentLabel = Literal["positive", "negative", "neutral"]
PipelineKey = Literal["en", "ru", "stub"]


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
    language: str = "en"


class TextSentimentEngine:
    def __init__(self, cfg: TextSentimentSettings) -> None:
        self.cfg = cfg
        self._pipelines: Dict[str, object] = {}

    def _resolve_language(self, text: str) -> str:
        if self.cfg.language == "auto":
            return detect_text_language(text)
        return self.cfg.language

    def _model_id_for(self, lang: str) -> str:
        if lang == "ru":
            return self.cfg.model_id
        return self.cfg.model_id_en

    def _load_pipeline(self, lang: str) -> PipelineKey:
        if lang in self._pipelines:
            return lang  # type: ignore[return-value]
        if not sentiment_model_available():
            self._pipelines[lang] = "stub"
            return "stub"
        try:
            from transformers import pipeline

            self._pipelines[lang] = pipeline(
                "sentiment-analysis",
                model=self._model_id_for(lang),
                device=-1,
            )
            return lang  # type: ignore[return-value]
        except Exception as exc:
            logger.warning("Text sentiment model load failed (%s), using stub: %s", lang, exc)
            self._pipelines[lang] = "stub"
            return "stub"

    def _map_label(self, raw: str, lang: str) -> SentimentLabel:
        label = raw.lower().strip()
        if lang == "en":
            if label in ("positive", "pos", "label_1", "1") or "pos" in label:
                return "positive"
            if label in ("negative", "neg", "label_0", "0") or "neg" in label:
                return "negative"
            return "neutral"
        if "pos" in label or label in ("label_2", "2"):
            return "positive"
        if "neg" in label or label in ("label_0", "0"):
            return "negative"
        return "neutral"

    def analyze(self, text: str) -> TextSentimentResult:
        cleaned = (text or "").strip()
        if not cleaned:
            return TextSentimentResult("neutral", 0.0, "stub", "en")

        lang = self._resolve_language(cleaned)
        pipeline_key = self._load_pipeline(lang)
        pipeline = self._pipelines.get(lang, "stub")
        if pipeline == "stub":
            return TextSentimentResult("neutral", 0.0, "stub", lang)

        try:
            result = pipeline(cleaned[:512])
            if not result:
                return TextSentimentResult("neutral", 0.0, "stub", lang)
            top = result[0]
            sentiment = self._map_label(str(top.get("label", "")), lang)
            score = float(top.get("score", 0.0))
            if score < self.cfg.confidence_threshold:
                return TextSentimentResult("neutral", score, "auto", lang)
            return TextSentimentResult(sentiment, score, "auto", lang)
        except Exception as exc:
            logger.debug("text sentiment failed (%s): %s", pipeline_key, exc)
            return TextSentimentResult("neutral", 0.0, "stub", lang)
