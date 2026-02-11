import { create } from 'zustand';
import type { ProcessConfig, SubtitleItem, VideoMetadata } from '../types';

interface AppState {
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;
  isPlaying: boolean;

  roi: [number, number, number, number];
  preset: string;
  config: Partial<ProcessConfig>;

  isProcessing: boolean;
  progress: { current: number; total: number; eta: string };
  subtitles: SubtitleItem[];
  logs: string[];
  clientId: string;

  setFile: (file: File) => void;
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
  deleteSubtitle: (id: number) => void; // NEW
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
    use_llm: false,
  },

  isProcessing: false,
  progress: { current: 0, total: 0, eta: '--:--' },
  subtitles: [],
  logs: [],
  clientId: crypto.randomUUID(),

  setFile: (file) => set({ file }),
  setMetadata: (metadata) => set({ metadata, currentFrameIndex: 0 }),
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
