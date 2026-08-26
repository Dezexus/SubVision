import { create } from 'zustand';
import type { OcrSettings } from '../types';

interface ConfigState {
  config: OcrSettings;
  setConfig: (newConfig: Partial<OcrSettings>) => void;
  resetConfig: () => void;
}

export const defaultConfig: OcrSettings = {
  preset: '⚖️ Balance',
  languages: 'en',
  step: 3,
  conf_threshold: 82,
  scale_factor: 1.5,
  denoise_strength: 2,
  smart_skip: true,
  motion_mse_thresh: 22,
  gap_tolerance: 3,
};

export const useConfigStore = create<ConfigState>((set) => ({
  config: defaultConfig,
  setConfig: (newConfig) =>
    set((state) => {
      const merged = { ...state.config, ...newConfig };
      if (merged.preset === '🎬 Mixed') {
        merged.preset = '⚖️ Balance';
      }
      return { config: merged };
    }),
  resetConfig: () => set({ config: defaultConfig }),
}));
