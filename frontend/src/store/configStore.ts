import { create } from 'zustand';

export interface ProcessConfig {
  preset: string;
  languages: string;
  roi: number[];
  step?: number;
  conf_threshold?: number;
  scale_factor?: number;
  denoise_strength?: number;
  smart_skip?: boolean;
  motion_mse_thresh?: number;
  gap_tolerance?: number;
}

interface ConfigState {
  config: ProcessConfig;
  setConfig: (newConfig: Partial<ProcessConfig>) => void;
  resetConfig: () => void;
}

const defaultConfig: ProcessConfig = {
  preset: '⚖️ Balance',
  languages: 'en',
  roi: [0, 0, 0, 0],
  step: 5,
  conf_threshold: 80,
  scale_factor: 1.0,
  denoise_strength: 0,
  smart_skip: true,
  motion_mse_thresh: 15,
  gap_tolerance: 5,
};

export { defaultConfig };

export const useConfigStore = create<ConfigState>((set) => ({
  config: defaultConfig,
  setConfig: (newConfig) =>
    set((state) => ({ config: { ...state.config, ...newConfig } })),
  resetConfig: () => set({ config: defaultConfig }),
}));
