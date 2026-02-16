// Global state management for the application using Zustand.
import { create } from 'zustand';
import type { ProcessConfig, SubtitleItem, VideoMetadata } from '../types';

interface AppState {
  // Video & Playback State
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;
  isPlaying: boolean;

  // OCR & Editor Configuration
  roi: [number, number, number, number]; // Region of Interest [x, y, w, h]
  preset: string; // The selected processing preset ID
  config: Partial<ProcessConfig>; // Fine-tuned settings

  // Processing & Results State
  isProcessing: boolean;
  progress: { current: number; total: number; eta: string };
  subtitles: SubtitleItem[];
  logs: string[];
  clientId: string; // Unique ID for this browser session

  // Actions to update state
  setFile: (file: File | null) => void;
  setMetadata: (meta: VideoMetadata) => void;
  setCurrentFrame: (index: number | ((prev: number) => number)) => void;
  setIsPlaying: (isPlaying: boolean) => void;

  setRoi: (roi: [number, number, number, number]) => void;
  updateConfig: (updates: Partial<ProcessConfig>) => void;
  setProcessing: (isProcessing: boolean) => void;
  addLog: (msg: string) => void;
  updateProgress: (current: number, total: number, eta: string) => void;

  addSubtitle: (sub: SubtitleItem) => void;
  updateSubtitle: (sub: SubtitleItem) => void;
  deleteSubtitle: (id: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // --- Initial State ---
  file: null,
  metadata: null,
  currentFrameIndex: 0,
  isPlaying: false,

  roi: [0, 0, 0, 0],
  preset: '⚖️ Balance',
  config: {
    step: 2,
    conf_threshold: 80,
    clahe_limit: 2.0,
    scale_factor: 2.0,
    smart_skip: true,
    visual_cutoff: true,
  },

  isProcessing: false,
  progress: { current: 0, total: 0, eta: '--:--' },
  subtitles: [],
  logs: [],
  clientId: crypto.randomUUID(), // Generate a unique ID for the WebSocket connection

  // --- Actions ---
  setFile: (file) => set({ file }),
  setMetadata: (metadata) => set({ metadata, currentFrameIndex: 0 }), // Reset frame index on new video
  setCurrentFrame: (index) => set((state) => ({
    currentFrameIndex: typeof index === 'function' ? index(state.currentFrameIndex) : index
  })),
  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setRoi: (roi) => set({ roi }),
  updateConfig: (updates) => set((state) => ({ config: { ...state.config, ...updates } })),
  setProcessing: (isProcessing) => set({ isProcessing }),
  addLog: (msg) => set((state) => ({ logs: [...state.logs, msg] })),
  updateProgress: (current, total, eta) => set({ progress: { current, total, eta } }),

  addSubtitle: (sub) => set((state) => ({ subtitles: [...state.subtitles, sub] })),
  updateSubtitle: (updatedSub) => set((state) => ({
    subtitles: state.subtitles.map(sub => sub.id === updatedSub.id ? updatedSub : sub)
  })),
  deleteSubtitle: (id) => set((state) => ({
    subtitles: state.subtitles.filter(sub => sub.id !== id)
  })),
}));
