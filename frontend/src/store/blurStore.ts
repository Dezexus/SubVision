import { create } from 'zustand';
import type { BlurSettings } from '../types';

/** Placeholder until blur-defaults loads from backend (matches domain/models.py). */
const placeholderBlurSettings: BlurSettings = {
  mode: 'hybrid',
  y: 0,
  font_size: 30,
  sigma: 5,
  feather: 40,
  width_multiplier: 1.0,
  height_multiplier: 1.5,
  encoder: 'auto',
};

export interface BlurState {
  isBlurMode: boolean;
  /** Settings per subtitle track; a missing entry falls back to the defaults. */
  trackSettings: BlurSettings[];
  defaultBlurSettings: BlurSettings | null;
  blurPreviewUrl: string | null;
}

export interface BlurActions {
  setBlurMode: (isActive: boolean) => void;
  setTrackSettings: (track: number, settings: Partial<BlurSettings>) => void;
  /** Store server defaults and reset every track to them. */
  setDefaultBlurSettings: (settings: BlurSettings) => void;
  resetTrack: (track: number) => void;
  /** Drop a track's settings; later tracks shift down. */
  removeTrack: (track: number) => void;
  setBlurPreviewUrl: (url: string | null) => void;
  reset: () => void;
}

type Store = BlurState & BlurActions;

export type TrackSettingsSource = Pick<BlurState, 'trackSettings' | 'defaultBlurSettings'>;

const baseSettings = (state: TrackSettingsSource): BlurSettings =>
  state.defaultBlurSettings ?? placeholderBlurSettings;

/** Effective settings of a track. */
export const settingsForTrack = (state: TrackSettingsSource, track: number): BlurSettings =>
  state.trackSettings[track] ?? baseSettings(state);

/** Settings for tracks 0..count-1, as the render request expects. */
export const allTrackSettings = (state: TrackSettingsSource, count: number): BlurSettings[] =>
  Array.from({ length: Math.max(1, count) }, (_, track) => settingsForTrack(state, track));

export const useBlurStore = create<Store>((set) => ({
  isBlurMode: false,
  trackSettings: [],
  defaultBlurSettings: null,
  blurPreviewUrl: null,

  setBlurMode: (isActive) => set({ isBlurMode: isActive, blurPreviewUrl: null }),

  setTrackSettings: (track, updates) =>
    set((state) => {
      const trackSettings = [...state.trackSettings];
      for (let i = trackSettings.length; i <= track; i++) trackSettings[i] = { ...baseSettings(state) };
      trackSettings[track] = { ...settingsForTrack(state, track), ...updates };
      return { trackSettings, blurPreviewUrl: null };
    }),

  setDefaultBlurSettings: (settings) =>
    set({ defaultBlurSettings: settings, trackSettings: [], blurPreviewUrl: null }),

  resetTrack: (track) =>
    set((state) => {
      if (track >= state.trackSettings.length) return {};
      const trackSettings = [...state.trackSettings];
      trackSettings[track] = { ...baseSettings(state) };
      return { trackSettings, blurPreviewUrl: null };
    }),

  removeTrack: (track) =>
    set((state) => ({
      trackSettings: state.trackSettings.filter((_, i) => i !== track),
      blurPreviewUrl: null,
    })),

  setBlurPreviewUrl: (url) => set({ blurPreviewUrl: url }),

  reset: () =>
    set({
      isBlurMode: false,
      trackSettings: [],
      defaultBlurSettings: null,
      blurPreviewUrl: null,
    }),
}));
