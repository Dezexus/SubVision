import { StateCreator } from 'zustand';
import type { VideoMetadata } from '../../types';
import type { AppState } from '../types';
import { api } from '../../services/api';
import { clearFrameCache } from '../../features/editor/hooks/useVideoFrame';

export interface VideoSlice {
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;
  isPreviewModalOpen: boolean;
  isPreviewMode: boolean;
  previewVolume: number;
  allowedExtensions: string[];
  setFile: (file: File | null) => void;
  setMetadata: (meta: VideoMetadata | null) => void;
  setCurrentFrame: (index: number | ((prev: number) => number)) => void;
  setPreviewModalOpen: (isOpen: boolean) => void;
  setPreviewMode: (active: boolean) => void;
  setPreviewVolume: (vol: number) => void;
  setAllowedExtensions: (extensions: string[]) => void;
  resetProject: () => void;
}

export const createVideoSlice: StateCreator<AppState, [], [], VideoSlice> = (set, get) => ({
  file: null,
  metadata: null,
  currentFrameIndex: 0,
  isPreviewModalOpen: false,
  isPreviewMode: false,
  previewVolume: 1,
  allowedExtensions: [],
  setFile: (file) => set({ file }),
  setMetadata: (metadata) => set({ metadata, currentFrameIndex: 0 }),
  setCurrentFrame: (index) => set((state) => ({
    currentFrameIndex: typeof index === 'function' ? index(state.currentFrameIndex) : index,
    blurPreviewUrl: null
  })),
  setPreviewModalOpen: (isOpen) => set({ isPreviewModalOpen: isOpen }),
  setPreviewMode: (active) => set({ isPreviewMode: active }),
  setPreviewVolume: (vol) => set({ previewVolume: Math.min(1, Math.max(0, vol)) }),
  setAllowedExtensions: (extensions) => set({ allowedExtensions: extensions }),
  resetProject: () => {
    const state = get();
    if (state.metadata) {
      api.deleteVideo(state.metadata.filename).catch(() => {});
    }
    clearFrameCache();
    set({
      file: null,
      metadata: null,
      currentFrameIndex: 0,
      roi: [0, 0, 0, 0],
      isBlurMode: false,
      subtitles: [],
      pastSubtitles: [],
      futureSubtitles: [],
      logs: [],
      progress: { current: 0, total: 0, eta: '--:--' },
      renderedVideoUrl: null,
      blurPreviewUrl: null,
      isPreviewModalOpen: false,
      isPreviewMode: false,
      previewVolume: 1,
    });
  }
});