/**
 * Emotion export settings (sync with backend emotion_models.py).
 */

export type InferenceBackend = 'onnx_cpu' | 'onnx_cuda' | 'torch_cpu' | 'torch_cuda';
export type OnnxDtype = 'fp32' | 'fp16';

export interface EmotionExportSettings {
  enabled: boolean;
  analyze_emotion: boolean;
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
  max_cues_per_job: number;
  progress_every_n_cues: number;
  cache_ttl_sec: number;
  cache_key_include_settings: boolean;
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

export interface EmotionJsonFormatSettings {
  schema_version: 3;
  filename_suffix: string;
  pretty_print: boolean;
  include_settings_snapshot: boolean;
  include_ocr_text: boolean;
  include_ocr_conf: boolean;
  include_emotion_probs: boolean;
  include_skipped_cues: boolean;
  include_timing_details: boolean;
  include_readability_metrics: boolean;
  include_audio_intensity: boolean;
  datetime_utc: boolean;
}

export interface EmotionAnalysisSettings {
  export: EmotionExportSettings;
  text_sentiment: TextSentimentSettings;
  json_format: EmotionJsonFormatSettings;
}

export interface EmotionExportRequest {
  filename: string;
  client_id: string;
  subtitles: import('./index').SubtitleItem[];
  emotion_settings?: Partial<EmotionAnalysisSettings> | EmotionAnalysisSettings;
  original_filename?: string;
}
