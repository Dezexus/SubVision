import { create } from 'zustand';
import { getClientId } from '../shared/lib';
import { api } from '../shared/api';
import { useProcessingStore } from './processingStore';
import { useBlurStore } from './blurStore';
import type { VideoMetadata } from '../types';

const STORAGE_KEY = 'subvision_video_state';

function storeVideoState(value: { filename: string; metadata: VideoMetadata } | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to persist video state', e);
  }
}

interface VideoState {
  file: File | null;
  filename: string | null;
  metadata: VideoMetadata | null;
  clientId: string;

  isPreviewMode: boolean;
  previewVolume: number;
  currentFrameIndex: number;
  roi: [number, number, number, number];

  initializeClientId: () => string;
  restoreVideoState: () => void;

  setFile: (file: File | null) => void;
  setMetadata: (metadata: VideoMetadata | null) => void;

  setPreviewMode: (mode: boolean) => void;
  setPreviewVolume: (vol: number) => void;
  setCurrentFrame: (frame: number | ((prev: number) => number)) => void;
  setRoi: (roi: [number, number, number, number]) => void;

  reset: () => void;
  resetProject: () => Promise<void>;
}

/**
 * Zustand store for managing video file state, metadata, and core playback metrics.
 */
export const useVideoStore = create<VideoState>()((set, get) => ({
  file: null,
  filename: null,
  metadata: null,
  clientId: '',

  isPreviewMode: false,
  previewVolume: 0.5,
  currentFrameIndex: 0,
  roi: [0, 0, 0, 0],

  initializeClientId: () => {
    const existingId = get().clientId;
    if (existingId) return existingId;

    const id = getClientId();
    set({ clientId: id });
    return id;
  },

  restoreVideoState: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.filename && parsed.metadata) {
          set({ filename: parsed.filename, metadata: parsed.metadata });
        }
      }
    } catch (e) {
      console.error('Failed to restore video state', e);
    }
  },

  setFile: (file) => set({ file }),

  setMetadata: (metadata) => {
    set({ metadata });
    if (metadata) storeVideoState({ filename: metadata.filename, metadata });
  },

  setPreviewMode: (isPreviewMode) => set({ isPreviewMode }),
  setPreviewVolume: (previewVolume) => set({ previewVolume }),

  setCurrentFrame: (frame) => set((state) => ({
    currentFrameIndex: typeof frame === 'function' ? frame(state.currentFrameIndex) : frame,
  })),

  setRoi: (roi) => set({ roi }),

  reset: () => {
    set({
      file: null,
      filename: null,
      metadata: null,
      isPreviewMode: false,
      currentFrameIndex: 0,
      roi: [0, 0, 0, 0],
    });
    storeVideoState(null);
  },

  resetProject: async () => {
    const currentFilename = get().metadata?.filename || get().filename;
    if (currentFilename) {
      try {
        await api.deleteVideo(currentFilename);
      } catch (e) {
        console.error('Failed to delete video on reset', e);
      }
    }
    useProcessingStore.getState().reset();
    useBlurStore.getState().reset();
    get().reset();
  },
}));
