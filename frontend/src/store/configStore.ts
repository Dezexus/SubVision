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
  step: 5,
  conf_threshold: 80,
  scale_factor: 1.0,
  denoise_strength: 0,
  smart_skip: true,
  motion_mse_thresh: 15,
  gap_tolerance: 5,
};

export const useConfigStore = create<ConfigState>((set) => ({
  config: defaultConfig,
  setConfig: (newConfig) =>
    set((state) => ({ config: { ...state.config, ...newConfig } })),
  resetConfig: () => set({ config: defaultConfig }),
}));
