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

export interface SubtitleItem {
  id: number;
  start: number;
  end: number;
  text: string;
  conf: number;
  is_corrected?: boolean;
}

export type WebSocketMessage =
  | { type: 'log'; message: string }
  | { type: 'progress'; current: number; total: number; eta: string }
  | { type: 'subtitle_new'; item: SubtitleItem }
  | { type: 'subtitle_update'; item: SubtitleItem }
  | { type: 'finish'; success: boolean };
