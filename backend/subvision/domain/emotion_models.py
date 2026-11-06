"""Emotion export settings (sync with frontend types)."""

from __future__ import annotations

from typing import Any, Dict, List, Literal

from pydantic import BaseModel, Field

InferenceBackend = Literal["onnx_cpu", "onnx_cuda", "torch_cpu", "torch_cuda"]
OnnxDtype = Literal["fp32", "fp16"]

TextSentimentLanguage = Literal["auto", "en", "ru"]


class TextSentimentSettings(BaseModel):
    """Local text sentiment (optional HF transformers pipeline)."""

    enabled: bool = False
    language: TextSentimentLanguage = "auto"
    model_id: str = "cointegrated/rubert-tiny-sentiment"
    model_id_en: str = "distilbert-base-uncased-finetuned-sst-2-english"
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    include_in_json: bool = True
    multimodal_fusion_enabled: bool = True


class EmotionExportSettings(BaseModel):
    """GigaAM-Emo + audio slice parameters."""

    enabled: bool = True
    analyze_emotion: bool = True
    use_cache: bool = True

    model_revision: str = "emo"
    inference_backend: InferenceBackend = "torch_cpu"
    onnx_dtype: OnnxDtype = "fp32"
    model_cache_dir: str = "uploads/models/gigaam"
    preload_model: bool = False

    sample_rate_hz: int = Field(default=16000, ge=8000, le=48000)
    channels: int = Field(default=1, ge=1, le=2)
    min_cue_duration_sec: float = Field(default=0.25, ge=0.05, le=2.0)
    max_cue_duration_sec: float = Field(default=20.0, ge=1.0, le=60.0)
    cue_padding_before_sec: float = Field(default=0.05, ge=0.0, le=1.0)
    cue_padding_after_sec: float = Field(default=0.05, ge=0.0, le=1.0)
    audio_track_index: int = Field(default=0, ge=0, le=7)
    normalize_audio: bool = True
    temp_dir: str = "uploads/.temp/audio"

    confidence_threshold: float = Field(default=0.40, ge=0.0, le=1.0)
    unknown_label: str = "unknown"
    labels: List[str] = Field(
        default_factory=lambda: ["anger", "sadness", "neutral", "happiness"]
    )
    label_map: Dict[str, str] = Field(
        default_factory=lambda: {
            "angry": "anger",
            "anger": "anger",
            "sad": "sadness",
            "sadness": "sadness",
            "neutral": "neutral",
            "positive": "happiness",
            "happiness": "happiness",
        }
    )

    max_cues_per_job: int = Field(default=5000, ge=1, le=50000)
    progress_every_n_cues: int = Field(default=1, ge=1, le=100)

    cache_ttl_sec: int = Field(default=86400, ge=60, le=604800)
    cache_key_include_settings: bool = True


class EmotionJsonFormatSettings(BaseModel):
    """JSON sidecar output options."""

    model_config = {"extra": "ignore"}

    schema_version: int = Field(default=3, ge=3, le=3)
    filename_suffix: str = "_emotion.json"
    pretty_print: bool = True
    include_settings_snapshot: bool = True
    include_ocr_text: bool = True
    include_ocr_conf: bool = True
    include_emotion_probs: bool = True
    include_skipped_cues: bool = True
    include_timing_details: bool = True
    include_readability_metrics: bool = True
    include_audio_intensity: bool = True
    datetime_utc: bool = True


class EmotionAnalysisSettings(BaseModel):
    """Full emotion export configuration."""

    model_config = {"extra": "ignore"}

    export: EmotionExportSettings = Field(default_factory=EmotionExportSettings)
    text_sentiment: TextSentimentSettings = Field(default_factory=TextSentimentSettings)
    json_format: EmotionJsonFormatSettings = Field(default_factory=EmotionJsonFormatSettings)

    def to_effective_dict(self) -> Dict[str, Any]:
        return self.model_dump()
