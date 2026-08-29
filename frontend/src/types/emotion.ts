/**
 * Emotion export + diarization + gender settings (sync with backend emotion_models.py).
 */

export type InferenceBackend = 'onnx_cpu' | 'onnx_cuda' | 'torch_cpu' | 'torch_cuda';
export type OnnxDtype = 'fp32' | 'fp16';
export type DiarizationDevice = 'cpu' | 'cuda';
export type CueSpeakerStrategy = 'max_overlap' | 'center_time' | 'dominant_energy';
export type SpeakerGender = 'male' | 'female' | 'unknown';

export interface EmotionExportSettings {
  enabled: boolean;
  analyze_emotion: boolean;
  analyze_speakers: boolean;
  use_cache: boolean;
  model_revision: string;
  inference_backend: InferenceBackend;
  onnx_dtype: OnnxDtype;
  model_cache_dir: string;
  preload_model: boolean;
  sample_rate_hz: number;
  channels: number;
  min_cue_duration_sec: number;
  max_cue_duration_sec: number;
  cue_padding_before_sec: number;
  cue_padding_after_sec: number;
  audio_track_index: number;
  normalize_audio: boolean;
  temp_dir: string;
  confidence_threshold: number;
  unknown_label: string;
  labels: string[];
  label_map: Record<string, string>;
  batch_size: number;
  max_cues_per_job: number;
  progress_every_n_cues: number;
  cache_ttl_sec: number;
  cache_key_include_settings: boolean;
}

export interface DiarizationSettings {
  enabled: boolean;
  model_id: string;
  min_speakers: number;
  max_speakers: number;
  num_speakers: number | null;
  exclusive_diarization: boolean;
  min_segment_duration_sec: number;
  inference_device: DiarizationDevice;
  long_audio_chunk_sec: number;
  long_audio_overlap_sec: number;
  speaker_id_prefix: string;
  cue_speaker_strategy: CueSpeakerStrategy;
  min_overlap_ratio: number;
  allow_multi_speaker_cue: boolean;
}

export interface GenderSettings {
  enabled: boolean;
  model_id: string;
  min_segment_sec: number;
  confidence_threshold: number;
  max_segments_per_speaker: number;
  allow_manual_override: boolean;
  include_in_json: boolean;
}

export interface TextSentimentSettings {
  enabled: boolean;
  language: 'auto' | 'en' | 'ru';
  model_id: string;
  model_id_en: string;
  confidence_threshold: number;
  include_in_json: boolean;
  multimodal_fusion_enabled: boolean;
}

export interface SpeakerProfileOverride {
  gender?: SpeakerGender;
  suggested_role?: string;
}

export interface EmotionJsonFormatSettings {
  schema_version: number;
  filename_suffix: string;
  pretty_print: boolean;
  include_source_block: boolean;
  include_settings_snapshot: boolean;
  include_ocr_text: boolean;
  include_ocr_conf: boolean;
  include_emotion_probs: boolean;
  include_speaker_id: boolean;
  include_speaker_gender: boolean;
  include_skipped_cues: boolean;
  include_diarization_timeline: boolean;
  include_timing_details: boolean;
  include_readability_metrics: boolean;
  include_translations_block: boolean;
  include_audio_intensity: boolean;
  datetime_utc: boolean;
}

export interface EmotionAnalysisSettings {
  export: EmotionExportSettings;
  diarization: DiarizationSettings;
  gender: GenderSettings;
  text_sentiment: TextSentimentSettings;
  json_format: EmotionJsonFormatSettings;
}

export interface EmotionExportRequest {
  filename: string;
  client_id: string;
  subtitles: import('./index').SubtitleItem[];
  emotion_settings?: Partial<EmotionAnalysisSettings> | EmotionAnalysisSettings;
  speaker_gender_overrides?: Record<string, SpeakerGender>;
  speaker_profile_overrides?: Record<string, SpeakerProfileOverride>;
  original_filename?: string;
}
