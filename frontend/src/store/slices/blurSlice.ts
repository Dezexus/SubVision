/**
 * Zustand slice for blur effect settings and previews.
 */
import { StateCreator } from 'zustand';
import type { BlurSettings } from '../../types';
import type { AppState } from '../types';

export interface BlurSlice {
  isBlurMode: boolean;
  blurSettings: BlurSettings;
  blurPreviewUrl: string | null;
  setBlurMode: (isActive: boolean) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setBlurPreviewUrl: (url: string | null) => void;
}

export const createBlurSlice: StateCreator<AppState, [], [], BlurSlice> = (set) => ({
  isBlurMode: false,
  blurSettings: {
    mode: 'hybrid',
    y: 912,
    font_size: 22,
    padding_x: 60,
    padding_y: 2.0,
    sigma: 5,
    feather: 40,
    width_multiplier: 1.0
  },
  blurPreviewUrl: null,
  setBlurMode: (isActive) => set({ isBlurMode: isActive, blurPreviewUrl: null }),
  setBlurSettings: (updates) => set((state) => ({
    blurSettings: { ...state.blurSettings, ...updates },
    blurPreviewUrl: null
  })),
  setBlurPreviewUrl: (url) => set({ blurPreviewUrl: url }),
});
