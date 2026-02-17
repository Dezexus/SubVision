import { create } from 'zustand';
import type { ProcessConfig, SubtitleItem, VideoMetadata, BlurSettings } from '../types';

interface AppState {
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;
  isPlaying: boolean;

  roi: [number, number, number, number];
  preset: string;
  config: Partial<ProcessConfig>;

  isBlurMode: boolean;
  blurSettings: BlurSettings;
  blurPreviewUrl: string | null;

  isProcessing: boolean;
  progress: { current: number; total: number; eta: string };
  subtitles: SubtitleItem[];
  logs: string[];
  clientId: string;

  renderedVideoUrl: string | null;

  setFile: (file: File | null) => void;
  setMetadata: (meta: VideoMetadata) => void;
  setCurrentFrame: (index: number | ((prev: number) => number)) => void;
  setIsPlaying: (isPlaying: boolean) => void;

  setRoi: (roi: [number, number, number, number]) => void;
  updateConfig: (updates: Partial<ProcessConfig>) => void;

  setBlurMode: (isActive: boolean) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setBlurPreviewUrl: (url: string | null) => void;

  setProcessing: (isProcessing: boolean) => void;
  addLog: (msg: string) => void;
  updateProgress: (current: number, total: number, eta: string) => void;

  addSubtitle: (sub: SubtitleItem) => void;
  setSubtitles: (subs: SubtitleItem[]) => void;
  updateSubtitle: (sub: SubtitleItem) => void;
  deleteSubtitle: (id: number) => void;

  setRenderedVideoUrl: (url: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
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

  isBlurMode: false,
  blurSettings: {
    type: 'box',
    y: 912,           // 1080 - 168 (from bottom)

    // --- DAVINCI RESOLVE "LIGHT MATTE" PRESETS ---
    font_size: 22,
    padding_x: 60,
    padding_y: 2.0,
    sigma: 10,        // Low intensity (10%) for subtle effect
    feather: 40       // Soft edges (40px)
  },
  blurPreviewUrl: null,

  isProcessing: false,
  progress: { current: 0, total: 0, eta: '--:--' },
  subtitles: [],
  logs: [],
  clientId: crypto.randomUUID(),
  renderedVideoUrl: null,

  setFile: (file) => set({
    file,
    subtitles: [],
    logs: [],
    renderedVideoUrl: null,
    currentFrameIndex: 0,
    blurPreviewUrl: null
  }),

  setMetadata: (metadata) => set({ metadata, currentFrameIndex: 0 }),

  setCurrentFrame: (index) => set((state) => ({
    currentFrameIndex: typeof index === 'function' ? index(state.currentFrameIndex) : index,
    blurPreviewUrl: null
  })),

  setIsPlaying: (isPlaying) => set({ isPlaying }),

  setRoi: (roi) => set({ roi }),

  updateConfig: (updates) => set((state) => ({ config: { ...state.config, ...updates } })),

  setBlurMode: (isActive) => set({ isBlurMode: isActive, blurPreviewUrl: null }),

  setBlurSettings: (updates) => set((state) => ({
    blurSettings: { ...state.blurSettings, ...updates },
    blurPreviewUrl: null
  })),

  setBlurPreviewUrl: (url) => set({ blurPreviewUrl: url }),

  setProcessing: (isProcessing) => set({ isProcessing }),

  addLog: (msg) => set((state) => ({ logs: [...state.logs, msg] })),

  updateProgress: (current, total, eta) => set({ progress: { current, total, eta } }),

  addSubtitle: (sub) => set((state) => ({ subtitles: [...state.subtitles, sub] })),

  setSubtitles: (subs) => set({ subtitles: subs }),

  updateSubtitle: (updatedSub) => set((state) => ({
    subtitles: state.subtitles.map(sub =>
      sub.id === updatedSub.id ? { ...updatedSub, isEdited: true } : sub
    )
  })),

  deleteSubtitle: (id) => set((state) => ({
    subtitles: state.subtitles.filter(sub => sub.id !== id)
  })),

  setRenderedVideoUrl: (url) => set({ renderedVideoUrl: url }),
}));
