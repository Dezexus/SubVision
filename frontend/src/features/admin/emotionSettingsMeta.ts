import type {
  DiarizationSettings,
  EmotionAnalysisSettings,
  EmotionExportSettings,
  EmotionJsonFormatSettings,
  GenderSettings,
  TextSentimentSettings,
} from '../types/emotion';

export const defaultEmotionExportSettings: EmotionExportSettings = {
  enabled: true,
  analyze_emotion: true,
  analyze_speakers: false,
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
  batch_size: 8,
  max_cues_per_job: 5000,
  progress_every_n_cues: 1,
  cache_ttl_sec: 86400,
  cache_key_include_settings: true,
};

export const defaultDiarizationSettings: DiarizationSettings = {
  enabled: false,
  model_id: 'pyannote/speaker-diarization-3.1',
  min_speakers: 1,
  max_speakers: 20,
  num_speakers: null,
  exclusive_diarization: true,
  min_segment_duration_sec: 0.3,
  inference_device: 'cpu',
  long_audio_chunk_sec: 600,
  long_audio_overlap_sec: 30,
  speaker_id_prefix: 'SPEAKER_',
  cue_speaker_strategy: 'max_overlap',
  min_overlap_ratio: 0.3,
  allow_multi_speaker_cue: false,
};

export const defaultGenderSettings: GenderSettings = {
  enabled: false,
  model_id: 'alefiury/wav2vec2-large-xlsr-53-gender-recognition-librispeech',
  min_segment_sec: 1.0,
  confidence_threshold: 0.55,
  max_segments_per_speaker: 3,
  allow_manual_override: true,
  include_in_json: true,
};

export const defaultTextSentimentSettings: TextSentimentSettings = {
  enabled: false,
  model_id: 'cointegrated/rubert-tiny-sentiment',
  confidence_threshold: 0.5,
  include_in_json: true,
};

export const defaultJsonFormatSettings: EmotionJsonFormatSettings = {
  schema_version: 3,
  filename_suffix: '_emotion.json',
  pretty_print: true,
  include_source_block: true,
  include_settings_snapshot: true,
  include_ocr_text: true,
  include_ocr_conf: true,
  include_emotion_probs: true,
  include_speaker_id: true,
  include_speaker_gender: true,
  include_skipped_cues: true,
  include_diarization_timeline: false,
  include_timing_details: true,
  include_readability_metrics: true,
  include_translations_block: false,
  include_audio_intensity: true,
  datetime_utc: true,
};

export const defaultEmotionAnalysisSettings: EmotionAnalysisSettings = {
  export: defaultEmotionExportSettings,
  diarization: defaultDiarizationSettings,
  gender: defaultGenderSettings,
  text_sentiment: defaultTextSentimentSettings,
  json_format: defaultJsonFormatSettings,
};

const STORAGE_KEY = 'subvision_emotion_settings';

export function loadLocalEmotionSettings(): EmotionAnalysisSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultEmotionAnalysisSettings;
    const parsed = JSON.parse(raw) as EmotionAnalysisSettings;
    return {
      export: { ...defaultEmotionExportSettings, ...parsed.export },
      diarization: { ...defaultDiarizationSettings, ...parsed.diarization },
      gender: { ...defaultGenderSettings, ...(parsed.gender ?? {}) },
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
  section: 'export' | 'diarization' | 'gender' | 'text_sentiment' | 'json_format';
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

/** Keys shown on the Quick tab (user-friendly subset). */
export const QUICK_EMOTION_KEYS = new Set([
  'enabled',
  'analyze_emotion',
  'analyze_speakers',
]);

export const EMOTION_SETTINGS_META: SettingFieldMeta[] = [
  { section: 'export', key: 'enabled', type: 'boolean', quick: true },
  { section: 'export', key: 'analyze_emotion', type: 'boolean', quick: true },
  { section: 'export', key: 'analyze_speakers', type: 'boolean', quick: true },
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
  { section: 'export', key: 'batch_size', type: 'number', min: 1, max: 64, step: 1 },
  { section: 'export', key: 'max_cues_per_job', type: 'number', min: 1, max: 50000, step: 100 },
  { section: 'export', key: 'cache_ttl_sec', type: 'number', min: 60, max: 604800, step: 3600 },
  { section: 'diarization', key: 'enabled', type: 'boolean', adminOnly: true },
  { section: 'diarization', key: 'min_speakers', type: 'number', min: 1, max: 20, step: 1, quick: true },
  { section: 'diarization', key: 'max_speakers', type: 'number', min: 1, max: 50, step: 1, quick: true },
  { section: 'diarization', key: 'inference_device', type: 'select', options: [
    { value: 'cpu' },
    { value: 'cuda' },
  ]},
  { section: 'diarization', key: 'min_overlap_ratio', type: 'number', min: 0, max: 1, step: 0.05, adminOnly: true },
  { section: 'diarization', key: 'cue_speaker_strategy', type: 'select', options: [
    { value: 'max_overlap' },
    { value: 'center_time' },
    { value: 'dominant_energy' },
  ], adminOnly: true },
  { section: 'gender', key: 'enabled', type: 'boolean', quick: true },
  { section: 'gender', key: 'allow_manual_override', type: 'boolean', quick: true },
  { section: 'gender', key: 'include_in_json', type: 'boolean', adminOnly: true },
  { section: 'gender', key: 'min_segment_sec', type: 'number', min: 0.3, max: 10, step: 0.1, adminOnly: true },
  { section: 'gender', key: 'confidence_threshold', type: 'number', min: 0, max: 1, step: 0.05, adminOnly: true },
  { section: 'gender', key: 'max_segments_per_speaker', type: 'number', min: 1, max: 10, step: 1, adminOnly: true },
  { section: 'text_sentiment', key: 'enabled', type: 'boolean', quick: true },
  { section: 'text_sentiment', key: 'model_id', type: 'string', adminOnly: true },
  { section: 'text_sentiment', key: 'confidence_threshold', type: 'number', min: 0, max: 1, step: 0.05, adminOnly: true },
  { section: 'text_sentiment', key: 'include_in_json', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'schema_version', type: 'number', min: 1, max: 99, step: 1, quick: true },
  { section: 'json_format', key: 'filename_suffix', type: 'string', quick: true },
  { section: 'json_format', key: 'include_timing_details', type: 'boolean' },
  { section: 'json_format', key: 'include_readability_metrics', type: 'boolean' },
  { section: 'json_format', key: 'include_audio_intensity', type: 'boolean' },
  { section: 'json_format', key: 'include_translations_block', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'pretty_print', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'include_settings_snapshot', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'include_speaker_id', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'include_speaker_gender', type: 'boolean', adminOnly: true },
  { section: 'json_format', key: 'include_diarization_timeline', type: 'boolean', adminOnly: true },
];
