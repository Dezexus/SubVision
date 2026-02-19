/**
 * Global application state management store.
 */
import { create } from 'zustand';
import type { ProcessConfig, SubtitleItem, VideoMetadata, BlurSettings } from '../types';

const getOrCreateClientId = (): string => {
  const stored = sessionStorage.getItem('subvision_client_id');
  if (stored) return stored;

  const newId = crypto.randomUUID();
  sessionStorage.setItem('subvision_client_id', newId);
  return newId;
};

interface AppState {
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;

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
  mergeSubtitles: (index: number) => void;

  setRenderedVideoUrl: (url: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  file: null,
  metadata: null,
  currentFrameIndex: 0,

  roi: [0, 0, 0, 0],
  preset: '⚖️ Balance',
  config: {
    step: 2,
    conf_threshold: 80,
    clahe_limit: 2.0,
    scale_factor: 2.0,
    smart_skip: true,
    visual_cutoff: true,
    languages: 'en',
  },

  isBlurMode: false,
  blurSettings: {
    type: 'box',
    y: 912,
    font_size: 22,
    padding_x: 60,
    padding_y: 2.0,
    sigma: 10,
    feather: 40
  },
  blurPreviewUrl: null,

  isProcessing: false,
  progress: { current: 0, total: 0, eta: '--:--' },
  subtitles: [],
  logs: [],
  clientId: getOrCreateClientId(),
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

  mergeSubtitles: (index) => set((state) => {
    const subs = [...state.subtitles];
    if (index < 0 || index >= subs.length - 1) return { subtitles: subs };

    const current = subs[index];
    const next = subs[index + 1];

    const merged: SubtitleItem = {
      ...current,
      end: next.end,
      text: `${current.text} ${next.text}`,
      conf: (current.conf + next.conf) / 2,
      isEdited: true
    };

    subs.splice(index, 2, merged);

    return { subtitles: subs };
  }),

  setRenderedVideoUrl: (url) => set({ renderedVideoUrl: url }),
}));
