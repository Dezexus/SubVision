/**
 * Zustand slice for process configuration and dynamic presets.
 */
import { StateCreator } from 'zustand';
import type { ProcessConfig, Preset, Language } from '../../types';
import type { AppState } from '../types';

export interface ConfigSlice {
  roi: [number, number, number, number];
  preset: string;
  config: Partial<ProcessConfig>;
  defaultConfig: Partial<ProcessConfig> | null;
  availablePresets: Preset[];
  availableLanguages: Language[];
  setRoi: (roi: [number, number, number, number]) => void;
  setPreset: (preset: string) => void;
  updateConfig: (updates: Partial<ProcessConfig>) => void;
  setDefaultConfig: (defaults: Partial<ProcessConfig>) => void;
  setAvailablePresets: (presets: Preset[]) => void;
  setAvailableLanguages: (languages: Language[]) => void;
}

export const createConfigSlice: StateCreator<AppState, [], [], ConfigSlice> = (set) => ({
  roi: [0, 0, 0, 0],
  preset: '',
  config: {},
  defaultConfig: null,
  availablePresets: [],
  availableLanguages: [],
  setRoi: (roi) => set({ roi }),
  setPreset: (preset) => set({ preset }),
  updateConfig: (updates) => set((state) => ({ config: { ...state.config, ...updates } })),
  setDefaultConfig: (defaults) => set((state) => ({
    defaultConfig: defaults,
    config: Object.keys(state.config).length === 0 ? { ...defaults } : { ...state.config }
  })),
  setAvailablePresets: (presets) => set({ availablePresets: presets }),
  setAvailableLanguages: (languages) => set({ availableLanguages: languages }),
});
