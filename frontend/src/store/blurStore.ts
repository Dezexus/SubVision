import { create } from 'zustand';
import type { BlurSettings } from '../types';

export interface BlurState {
  isBlurMode: boolean;
  blurSettings: BlurSettings;
  defaultBlurSettings: BlurSettings | null;
  blurPreviewUrl: string | null;
}

export interface BlurActions {
  setBlurMode: (isActive: boolean) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setDefaultBlurSettings: (settings: BlurSettings) => void;
  setBlurPreviewUrl: (url: string | null) => void;
  reset: () => void;
}

const initialBlurSettings: BlurSettings = {
  mode: 'hybrid',
  y: 912,
  font_size: 22,
  padding_x: 0.4,
  padding_y: 2.0,
  sigma: 5,
  feather: 40,
  width_multiplier: 1.0,
  height_multiplier: 1.0,
  encoder: 'auto',
};

export const useBlurStore = create<BlurState & BlurActions>((set) => ({
  isBlurMode: false,
  blurSettings: { ...initialBlurSettings },
  defaultBlurSettings: null,
  blurPreviewUrl: null,

  setBlurMode: (isActive) => set({ isBlurMode: isActive, blurPreviewUrl: null }),
  setBlurSettings: (updates) =>
    set((state) => ({
      blurSettings: { ...state.blurSettings, ...updates },
      blurPreviewUrl: null,
    })),
  setDefaultBlurSettings: (settings) =>
    set({ defaultBlurSettings: settings, blurSettings: { ...settings } }),
  setBlurPreviewUrl: (url) => set({ blurPreviewUrl: url }),
  reset: () =>
    set({
      isBlurMode: false,
      blurSettings: { ...initialBlurSettings },
      defaultBlurSettings: null,
      blurPreviewUrl: null,
    }),
}));