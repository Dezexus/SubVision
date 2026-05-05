import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ConfigState {
  config: Record<string, any>;
  preset: string;
  defaultConfig: Record<string, any> | null;
  setConfig: (updates: Record<string, any>) => void;
  setPreset: (preset: string) => void;
  setDefaultConfig: (defaults: Record<string, any>) => void;
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      config: {},
      preset: '',
      defaultConfig: null,

      setConfig: (updates) =>
        set((state) => ({ config: { ...state.config, ...updates } })),

      setPreset: (preset) => set({ preset }),

      setDefaultConfig: (defaults) =>
        set((state) => ({
          defaultConfig: defaults,
          config: Object.keys(state.config).length === 0 ? { ...defaults } : { ...state.config },
        })),
    }),
    {
      name: 'subvision-config',
    }
  )
);