/**
 * Zustand slice for video file and metadata management including global project reset.
 */
import { StateCreator } from 'zustand';
import type { VideoMetadata } from '../../types';
import type { AppState } from '../types';

export interface VideoSlice {
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;
  isPreviewModalOpen: boolean;
  allowedExtensions: string[];
  setFile: (file: File | null) => void;
  setMetadata: (meta: VideoMetadata | null) => void;
  setCurrentFrame: (index: number | ((prev: number) => number)) => void;
  setPreviewModalOpen: (isOpen: boolean) => void;
  setAllowedExtensions: (extensions: string[]) => void;
  resetProject: () => void;
}

export const createVideoSlice: StateCreator<AppState, [], [], VideoSlice> = (set) => ({
  file: null,
  metadata: null,
  currentFrameIndex: 0,
  isPreviewModalOpen: false,
  allowedExtensions: [],
  setFile: (file) => set({ file }),
  setMetadata: (metadata) => set({ metadata, currentFrameIndex: 0 }),
  setCurrentFrame: (index) => set((state) => ({
    currentFrameIndex: typeof index === 'function' ? index(state.currentFrameIndex) : index,
    blurPreviewUrl: null
  })),
  setPreviewModalOpen: (isOpen) => set({ isPreviewModalOpen: isOpen }),
  setAllowedExtensions: (extensions) => set({ allowedExtensions: extensions }),
  resetProject: () => set({
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
    isPreviewModalOpen: false
  })
});
