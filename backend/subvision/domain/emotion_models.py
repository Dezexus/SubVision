"""Emotion export + diarization settings (sync with frontend types)."""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

InferenceBackend = Literal["onnx_cpu", "onnx_cuda", "torch_cpu", "torch_cuda"]
OnnxDtype = Literal["fp32", "fp16"]
DiarizationDevice = Literal["cpu", "cuda"]
CueSpeakerStrategy = Literal["max_overlap", "center_time", "dominant_energy"]
SpeakerGender = Literal["male", "female", "unknown"]
GenderSource = Literal["auto", "manual", "stub"]


class TextSentimentSettings(BaseModel):
    """Local text sentiment (optional HF transformers pipeline)."""

    enabled: bool = False
    model_id: str = "cointegrated/rubert-tiny-sentiment"
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    include_in_json: bool = True


class GenderSettings(BaseModel):
    """Speaker gender classification parameters."""

    enabled: bool = False
    model_id: str = "alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech"
    min_segment_sec: float = Field(default=1.0, ge=0.3, le=10.0)
    confidence_threshold: float = Field(default=0.55, ge=0.0, le=1.0)
    max_segments_per_speaker: int = Field(default=3, ge=1, le=10)
    allow_manual_override: bool = True
    include_in_json: bool = True


class EmotionExportSettings(BaseModel):
    """GigaAM-Emo + audio slice parameters."""

    enabled: bool = True
    analyze_emotion: bool = True
    analyze_speakers: bool = False
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

    batch_size: int = Field(default=8, ge=1, le=64)
    max_cues_per_job: int = Field(default=5000, ge=1, le=50000)
    progress_every_n_cues: int = Field(default=1, ge=1, le=100)

    cache_ttl_sec: int = Field(default=86400, ge=60, le=604800)
    cache_key_include_settings: bool = True


class DiarizationSettings(BaseModel):
    """PyAnnote speaker diarization parameters."""

    enabled: bool = False
    model_id: str = "pyannote/speaker-diarization-3.1"
    min_speakers: int = Field(default=1, ge=1, le=20)
    max_speakers: int = Field(default=20, ge=1, le=50)
    num_speakers: Optional[int] = Field(default=None, ge=1, le=50)
    exclusive_diarization: bool = True
    min_segment_duration_sec: float = Field(default=0.3, ge=0.1, le=5.0)
    inference_device: DiarizationDevice = "cpu"
    long_audio_chunk_sec: float = Field(default=600.0, ge=60.0, le=3600.0)
    long_audio_overlap_sec: float = Field(default=30.0, ge=0.0, le=120.0)
    speaker_id_prefix: str = "SPEAKER_"
    cue_speaker_strategy: CueSpeakerStrategy = "max_overlap"
    min_overlap_ratio: float = Field(default=0.30, ge=0.0, le=1.0)
    allow_multi_speaker_cue: bool = False


class EmotionJsonFormatSettings(BaseModel):
    """JSON sidecar output options."""

    schema_version: int = Field(default=3, ge=1, le=99)
    filename_suffix: str = "_emotion.json"
    pretty_print: bool = True
    include_source_block: bool = True
    include_settings_snapshot: bool = True
    include_ocr_text: bool = True
    include_ocr_conf: bool = True
    include_emotion_probs: bool = True
    include_speaker_id: bool = True
    include_speaker_gender: bool = True
    include_skipped_cues: bool = True
    include_diarization_timeline: bool = False
    include_timing_details: bool = True
    include_readability_metrics: bool = True
    include_translations_block: bool = False
    include_audio_intensity: bool = True
    datetime_utc: bool = True


class EmotionAnalysisSettings(BaseModel):
    """Full emotion export configuration."""

    export: EmotionExportSettings = Field(default_factory=EmotionExportSettings)
    diarization: DiarizationSettings = Field(default_factory=DiarizationSettings)
    gender: GenderSettings = Field(default_factory=GenderSettings)
    text_sentiment: TextSentimentSettings = Field(default_factory=TextSentimentSettings)
    json_format: EmotionJsonFormatSettings = Field(default_factory=EmotionJsonFormatSettings)

    @model_validator(mode="after")
    def sync_diarization_flag(self) -> "EmotionAnalysisSettings":
        if self.export.analyze_speakers:
            self.diarization.enabled = True
            if self.gender.enabled is False and self.export.analyze_speakers:
                pass  # gender stays off unless explicitly enabled
        return self

    def to_effective_dict(self) -> Dict[str, Any]:
        return self.model_dump()
