export interface VideoMetadata {
  filename: string;
  total_frames: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
}

export interface ProcessConfig {
  filename: string;
  client_id: string;
  roi: [number, number, number, number];
  preset: string;
  languages: string;
  step: number;
  conf_threshold: number;
  clahe_limit: number;
  scale_factor: number;
  smart_skip: boolean;
  visual_cutoff: boolean;
}

export interface BlurSettings {
  y: number;
  font_size: number;
  padding_x: number;
  padding_y: number;
  sigma: number;
  feather: number;
  width_multiplier: number;
  x?: number;
  w?: number;
  h?: number;
}

export interface RenderConfig {
  filename: string;
  client_id: string;
  subtitles: SubtitleItem[];
  blur_settings: BlurSettings;
}

export interface SubtitleItem {
  id: number;
  start: number;
  end: number;
  text: string;
  conf: number;
  isEdited?: boolean;
}

export type WebSocketMessage =
  | { type: 'log'; message: string }
  | { type: 'progress'; current: number; total: number; eta: string }
  | { type: 'subtitle_new'; item: SubtitleItem }
  | { type: 'subtitle_update'; item: SubtitleItem }
  | { type: 'finish'; success: boolean; download_url?: string; error?: string };
