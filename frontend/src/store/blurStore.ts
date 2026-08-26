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

/** Placeholder until blur-defaults loads from backend (matches domain/models.py). */
const placeholderBlurSettings: BlurSettings = {
  mode: 'hybrid',
  y: 0,
  font_size: 30,
  sigma: 5,
  feather: 40,
  width_multiplier: 1.0,
  height_multiplier: 1.2,
  encoder: 'auto',
  propainter_neighbor_length: 6,
  propainter_ref_stride: 10,
  propainter_subvideo_length: 30,
  propainter_fp16: true,
  propainter_roi_pad: 32,
  propainter_mask_dilation: 4,
};

export const useBlurStore = create<BlurState & BlurActions>((set) => ({
  isBlurMode: false,
  blurSettings: { ...placeholderBlurSettings },
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
      blurSettings: { ...placeholderBlurSettings },
      defaultBlurSettings: null,
      blurPreviewUrl: null,
    }),
}));
