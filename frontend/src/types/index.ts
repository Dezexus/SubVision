// Defines the core data structures and types used throughout the application.

/** Represents the essential metadata extracted from an uploaded video file. */
export interface VideoMetadata {
  filename: string;
  total_frames: number;
  width: number;
  height: number;
  fps: number;
  duration: number; // in seconds
}

/** Defines the complete configuration sent to the backend to start a processing job. */
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

/** Represents a single, discrete subtitle block with its timing, text, and confidence. */
export interface SubtitleItem {
  id: number;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
  conf: number;  // confidence score (0.0 to 1.0)
  isEdited?: boolean;
  is_corrected?: boolean; // Optional flag for UI state
}

/** A union type representing all possible messages received from the WebSocket server. */
export type WebSocketMessage =
  | { type: 'log'; message: string }
  | { type: 'progress'; current: number; total: number; eta: string }
  | { type: 'subtitle_new'; item: SubtitleItem }
  | { type: 'subtitle_update'; item: SubtitleItem }
  | { type: 'finish'; success: boolean };
