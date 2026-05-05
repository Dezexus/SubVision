import { create } from 'zustand';
import type { VideoMetadata } from '../types';
import { api } from '../services/api';

let cachedClientId: string | null = null;

export interface VideoState {
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;
  isPreviewMode: boolean;
  previewVolume: number;
  allowedExtensions: string[];
  clientId: string | null;
  roi: [number, number, number, number];
}

export interface VideoActions {
  setFile: (file: File | null) => void;
  setMetadata: (meta: VideoMetadata | null) => void;
  setCurrentFrame: (index: number | ((prev: number) => number)) => void;
  setPreviewMode: (active: boolean) => void;
  setPreviewVolume: (vol: number) => void;
  setAllowedExtensions: (exts: string[]) => void;
  setRoi: (roi: [number, number, number, number]) => void;
  initializeClientId: () => Promise<void>;
  resetProject: () => void;
}

export const useVideoStore = create<VideoState & VideoActions>((set, get) => ({
  file: null,
  metadata: null,
  currentFrameIndex: 0,
  isPreviewMode: false,
  previewVolume: 1,
  allowedExtensions: [],
  clientId: null,
  roi: [0, 0, 0, 0],

  setFile: (file) => set({ file }),
  setMetadata: (metadata) => set({ metadata, currentFrameIndex: 0 }),
  setCurrentFrame: (index) =>
    set((state) => ({
      currentFrameIndex:
        typeof index === 'function' ? index(state.currentFrameIndex) : index,
    })),
  setPreviewMode: (active) => set({ isPreviewMode: active }),
  setPreviewVolume: (vol) => set({ previewVolume: Math.min(1, Math.max(0, vol)) }),
  setAllowedExtensions: (exts) => set({ allowedExtensions: exts }),
  setRoi: (roi) => set({ roi }),

  initializeClientId: async () => {
    if (cachedClientId) {
      set({ clientId: cachedClientId });
      return;
    }
    const stored = sessionStorage.getItem('subvision_client_id');
    if (stored) {
      cachedClientId = stored;
      set({ clientId: stored });
      return;
    }
    const { client_id } = await api.registerSession();
    sessionStorage.setItem('subvision_client_id', client_id);
    cachedClientId = client_id;
    set({ clientId: client_id });
  },

  resetProject: () => {
    const state = get();
    if (state.metadata) {
      api.deleteVideo(state.metadata.filename).catch(() => {});
    }
    set({
      file: null,
      metadata: null,
      currentFrameIndex: 0,
      isPreviewMode: false,
      previewVolume: 1,
      roi: [0, 0, 0, 0],
    });
  },
}));