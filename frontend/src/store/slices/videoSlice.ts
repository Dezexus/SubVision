/**
 * Zustand slice for video file and metadata management.
 */
import { StateCreator } from 'zustand';
import type { VideoMetadata } from '../../types';
import type { AppState } from '../types';

export interface VideoSlice {
  file: File | null;
  metadata: VideoMetadata | null;
  currentFrameIndex: number;
  isPreviewModalOpen: boolean;
  setFile: (file: File | null) => void;
  setMetadata: (meta: VideoMetadata) => void;
  setCurrentFrame: (index: number | ((prev: number) => number)) => void;
  setPreviewModalOpen: (isOpen: boolean) => void;
}

export const createVideoSlice: StateCreator<AppState, [], [], VideoSlice> = (set) => ({
  file: null,
  metadata: null,
  currentFrameIndex: 0,
  isPreviewModalOpen: false,
  setFile: (file) => set({
    file,
    subtitles: [],
    logs: [],
    renderedVideoUrl: null,
    currentFrameIndex: 0,
    blurPreviewUrl: null,
    isPreviewModalOpen: false
  }),
  setMetadata: (metadata) => set({ metadata, currentFrameIndex: 0 }),
  setCurrentFrame: (index) => set((state) => ({
    currentFrameIndex: typeof index === 'function' ? index(state.currentFrameIndex) : index,
    blurPreviewUrl: null
  })),
  setPreviewModalOpen: (isOpen) => set({ isPreviewModalOpen: isOpen }),
});
