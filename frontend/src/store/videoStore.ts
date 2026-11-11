import { create } from 'zustand';
import { getClientId, MAX_TRACKS } from '../shared/lib';
import { api } from '../shared/api';
import { useProcessingStore } from './processingStore';
import { useBlurStore } from './blurStore';
import type { Roi, VideoMetadata } from '../types';

const EMPTY_ROI: Roi = [0, 0, 0, 0];

const STORAGE_KEY = 'subvision_video_state';

interface PersistedVideoState {
  filename: string;
  metadata: VideoMetadata;
  rois?: Roi[];
  trackNames?: string[];
}

function storeVideoState(value: PersistedVideoState | null): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to persist video state', e);
  }
}

const isRoi = (r: unknown): r is Roi =>
  Array.isArray(r) && r.length === 4 && r.every((v) => typeof v === 'number');

interface VideoState {
  file: File | null;
  filename: string | null;
  metadata: VideoMetadata | null;
  clientId: string;

  isPreviewMode: boolean;
  previewVolume: number;
  currentFrameIndex: number;
  /** One ROI per subtitle track; index = track. */
  rois: Roi[];
  /** User names per track; empty means "Track N". */
  trackNames: string[];
  /**
   * The one current track of the app: its ROI is drawn on the frame, and blur
   * settings, SRT import, the list filter and timing hotkeys all apply to it.
   */
  activeTrack: number;

  initializeClientId: () => string;
  restoreVideoState: () => void;

  setFile: (file: File | null) => void;
  setMetadata: (metadata: VideoMetadata | null) => void;

  setPreviewMode: (mode: boolean) => void;
  setPreviewVolume: (vol: number) => void;
  setCurrentFrame: (frame: number | ((prev: number) => number)) => void;
  /** Set the ROI of the active track. */
  setRoi: (roi: Roi) => void;
  setActiveTrack: (track: number) => void;
  /** Add a region and make it current. */
  addTrack: () => void;
  renameTrack: (track: number, name: string) => void;
  /**
   * Remove a track with its region, cues and blur settings; later tracks shift
   * down by one. Dropping the cues is one undoable step.
   */
  removeTrack: (track: number) => void;
  /** Forget regions and names (a new video). */
  resetTracks: () => void;

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
  rois: [EMPTY_ROI],
  trackNames: [],
  activeTrack: 0,

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
      if (!saved) return;
      const parsed = JSON.parse(saved) as Partial<PersistedVideoState>;
      if (!parsed.filename || !parsed.metadata) return;
      const rois = Array.isArray(parsed.rois) ? parsed.rois.filter(isRoi).slice(0, MAX_TRACKS) : [];
      const trackNames = Array.isArray(parsed.trackNames)
        ? parsed.trackNames.map((n) => (typeof n === 'string' ? n : '')).slice(0, MAX_TRACKS)
        : [];
      set({
        filename: parsed.filename,
        metadata: parsed.metadata,
        rois: rois.length > 0 ? rois : [EMPTY_ROI],
        trackNames,
      });
    } catch (e) {
      console.error('Failed to restore video state', e);
    }
  },

  setFile: (file) => set({ file }),

  setMetadata: (metadata) => {
    set({ metadata, ...(metadata ? { filename: metadata.filename } : {}) });
  },

  setPreviewMode: (isPreviewMode) => set({ isPreviewMode }),
  setPreviewVolume: (previewVolume) => set({ previewVolume }),

  setCurrentFrame: (frame) => set((state) => ({
    currentFrameIndex: typeof frame === 'function' ? frame(state.currentFrameIndex) : frame,
  })),

  setRoi: (roi) => set((state) => {
    const rois = [...state.rois];
    while (rois.length <= state.activeTrack) rois.push(EMPTY_ROI);
    rois[state.activeTrack] = roi;
    return { rois };
  }),

  setActiveTrack: (track) => set({ activeTrack: Math.max(0, Math.min(track, MAX_TRACKS - 1)) }),

  addTrack: () => set((state) => {
    if (state.rois.length >= MAX_TRACKS) return {};
    return { rois: [...state.rois, EMPTY_ROI], activeTrack: state.rois.length };
  }),

  renameTrack: (track, name) => set((state) => {
    const trackNames = [...state.trackNames];
    while (trackNames.length <= track) trackNames.push('');
    trackNames[track] = name.trim().slice(0, 40);
    return { trackNames };
  }),

  removeTrack: (track) => {
    const state = get();
    const rois = state.rois.filter((_, i) => i !== track);
    set({
      rois: rois.length > 0 ? rois : [EMPTY_ROI],
      trackNames: state.trackNames.filter((_, i) => i !== track),
      activeTrack: state.activeTrack > track ? state.activeTrack - 1 : Math.min(state.activeTrack, Math.max(0, rois.length - 1)),
    });
    useProcessingStore.getState().removeTrack(track);
    useBlurStore.getState().removeTrack(track);
  },

  resetTracks: () => set({ rois: [EMPTY_ROI], trackNames: [], activeTrack: 0 }),

  reset: () => {
    set({
      file: null,
      filename: null,
      metadata: null,
      isPreviewMode: false,
      currentFrameIndex: 0,
      rois: [EMPTY_ROI],
      trackNames: [],
      activeTrack: 0,
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

// Keep the project (video, regions, names) across reloads.
useVideoStore.subscribe((state, prev) => {
  if (state.metadata === prev.metadata && state.rois === prev.rois && state.trackNames === prev.trackNames) return;
  if (!state.metadata) return;
  storeVideoState({
    filename: state.metadata.filename,
    metadata: state.metadata,
    rois: state.rois,
    trackNames: state.trackNames,
  });
});
