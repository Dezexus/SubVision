/**
 * Zustand slice for process configuration and presets.
 */
import { StateCreator } from 'zustand';
import type { ProcessConfig } from '../../types';
import type { AppState } from '../types';

export interface ConfigSlice {
  roi: [number, number, number, number];
  preset: string;
  config: Partial<ProcessConfig>;
  setRoi: (roi: [number, number, number, number]) => void;
  setPreset: (preset: string) => void;
  updateConfig: (updates: Partial<ProcessConfig>) => void;
}

export const createConfigSlice: StateCreator<AppState, [], [], ConfigSlice> = (set) => ({
  roi: [0, 0, 0, 0],
  preset: '⚖️ Balance',
  config: {
    step: 2,
    conf_threshold: 80,
    scale_factor: 2.0,
    smart_skip: true,
    languages: 'en',
  },
  setRoi: (roi) => set({ roi }),
  setPreset: (preset) => set({ preset }),
  updateConfig: (updates) => set((state) => ({ config: { ...state.config, ...updates } })),
});
