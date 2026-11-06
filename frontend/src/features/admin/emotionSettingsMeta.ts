import type {
  EmotionAnalysisSettings,
  EmotionExportSettings,
  EmotionJsonFormatSettings,
  TextSentimentSettings,
} from '../../types/emotion';

export const defaultEmotionExportSettings: EmotionExportSettings = {
  enabled: true,
  analyze_emotion: true,
  use_cache: true,
  model_revision: 'emo',
  inference_backend: 'torch_cpu',
  onnx_dtype: 'fp32',
  model_cache_dir: 'uploads/models/gigaam',
  preload_model: false,
  sample_rate_hz: 16000,
  channels: 1,
  min_cue_duration_sec: 0.25,
  max_cue_duration_sec: 20,
  cue_padding_before_sec: 0.05,
  cue_padding_after_sec: 0.05,
  audio_track_index: 0,
  normalize_audio: true,
  temp_dir: 'uploads/.temp/audio',
  confidence_threshold: 0.4,
  unknown_label: 'unknown',
  labels: ['anger', 'sadness', 'neutral', 'happiness'],
  label_map: {
    angry: 'anger',
    anger: 'anger',
    sad: 'sadness',
    sadness: 'sadness',
    neutral: 'neutral',
    positive: 'happiness',
    happiness: 'happiness',
  },
  max_cues_per_job: 5000,
  progress_every_n_cues: 1,
  cache_ttl_sec: 86400,
  cache_key_include_settings: true,
};

export const defaultTextSentimentSettings: TextSentimentSettings = {
  enabled: false,
  language: 'auto',
  model_id: 'cointegrated/rubert-tiny-sentiment',
  model_id_en: 'distilbert-base-uncased-finetuned-sst-2-english',
  confidence_threshold: 0.5,
  include_in_json: true,
  multimodal_fusion_enabled: true,
};

export const defaultJsonFormatSettings: EmotionJsonFormatSettings = {
  schema_version: 3,
  filename_suffix: '_emotion.json',
  pretty_print: true,
  include_settings_snapshot: true,
  include_ocr_text: true,
  include_ocr_conf: true,
  include_emotion_probs: true,
  include_skipped_cues: true,
  include_timing_details: true,
  include_readability_metrics: true,
  include_audio_intensity: true,
  datetime_utc: true,
};

export const defaultEmotionAnalysisSettings: EmotionAnalysisSettings = {
  export: defaultEmotionExportSettings,
  text_sentiment: defaultTextSentimentSettings,
  json_format: defaultJsonFormatSettings,
};

const STORAGE_KEY = 'subvision_emotion_settings';

export function loadLocalEmotionSettings(): EmotionAnalysisSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEmotionAnalysisSettings;
    const parsed = JSON.parse(raw) as Partial<EmotionAnalysisSettings>;
    return {
      export: { ...defaultEmotionExportSettings, ...parsed.export },
      text_sentiment: { ...defaultTextSentimentSettings, ...(parsed.text_sentiment ?? {}) },
      json_format: { ...defaultJsonFormatSettings, ...parsed.json_format },
    };
  } catch {
    return defaultEmotionAnalysisSettings;
  }
}

export function saveLocalEmotionSettings(settings: EmotionAnalysisSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export type SettingFieldType = 'boolean' | 'number' | 'string' | 'select';

export interface SettingFieldMeta {
  section: 'export' | 'text_sentiment' | 'json_format';
  key: string;
  type: SettingFieldType;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; labelKey?: string }[];
  quick?: boolean;
  /** Hidden in export dialog advanced tab (admin panel only). */
  adminOnly?: boolean;
}

export const EMOTION_SETTINGS_META: SettingFieldMeta[] = [
  { section: 'export', key: 'enabled', type: 'boolean', quick: true },
  { section: 'export', key: 'analyze_emotion', type: 'boolean', quick: true },
  { section: 'export', key: 'use_cache', type: 'boolean' },
  { section: 'export', key: 'inference_backend', type: 'select', options: [
    { value: 'torch_cpu' },
    { value: 'torch_cuda' },
    { value: 'onnx_cpu' },
    { value: 'onnx_cuda' },
  ]},
  { section: 'export', key: 'onnx_dtype', type: 'select', options: [
    { value: 'fp32' },
    { value: 'fp16' },
  ]},
  { section: 'export', key: 'sample_rate_hz', type: 'number', min: 8000, max: 48000, step: 1000 },
  { section: 'export', key: 'min_cue_duration_sec', type: 'number', min: 0.05, max: 2, step: 0.05 },
  { section: 'export', key: 'max_cue_duration_sec', type: 'number', min: 1, max: 60, step: 1 },
  { section: 'export', key: 'cue_padding_before_sec', type: 'number', min: 0, max: 1, step: 0.05 },
  { section: 'export', key: 'cue_padding_after_sec', type: 'number', min: 0, max: 1, step: 0.05 },
  { section: 'export', key: 'confidence_threshold', type: 'number', min: 0, max: 1, step: 0.05 },
  { section: 'export', key: 'max_cues_per_job', type: 'number', min: 1, max: 50000, step: 100 },
  { section: 'export', key: 'cache_ttl_sec', type: 'number', min: 60, max: 604800, step: 3600 },
  { section: 'text_sentiment', key: 'enabled', type: 'boolean', quick: true },
  { section: 'text_sentiment', key: 'language', type: 'select', options: [
    { value: 'auto' },
    { value: 'en' },
    { value: 'ru' },
  ], adminOnly: true },
  { section: 'text_sentiment', key: 'model_id', type: 'string', adminOnly: true },
  { section: 'text_sentiment', key: 'model_id_en', type: 'string', adminOnly: true },
  { section: 'text_sentiment', key: 'confidence_threshold', type: 'number', min: 0, max: 1, step: 0.05, adminOnly: true },
  { section: 'text_sentiment', key: 'include_in_json', type: 'boolean', adminOnly: true },
  { section: 'text_sentiment', key: 'multimodal_fusion_enabled', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'filename_suffix', type: 'string', quick: true },
  { section: 'json_format', key: 'include_timing_details', type: 'boolean' },
  { section: 'json_format', key: 'include_readability_metrics', type: 'boolean' },
  { section: 'json_format', key: 'include_audio_intensity', type: 'boolean' },
  { section: 'json_format', key: 'pretty_print', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'include_settings_snapshot', type: 'boolean', adminOnly: true },
];
