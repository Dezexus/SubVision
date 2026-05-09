import { create } from 'zustand';

export interface ProcessConfig {
  preset: string;
  languages: string;
  roi: number[];
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
};

export const useConfigStore = create<ConfigState>((set) => ({
  config: defaultConfig,
  setConfig: (newConfig) =>
    set((state) => ({ config: { ...state.config, ...newConfig } })),
  resetConfig: () => set({ config: defaultConfig }),
}));