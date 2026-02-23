/**
 * Main application store combining all modular slices with local storage persistence.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppState } from './types';
import { createVideoSlice } from './slices/videoSlice';
import { createConfigSlice } from './slices/configSlice';
import { createBlurSlice } from './slices/blurSlice';
import { createProcessSlice } from './slices/processSlice';
import { createToastSlice } from './slices/toastSlice';

export const useAppStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createVideoSlice(...a),
      ...createConfigSlice(...a),
      ...createBlurSlice(...a),
      ...createProcessSlice(...a),
      ...createToastSlice(...a),
    }),
    {
      name: 'subvision-storage',
      partialize: (state) => ({
        metadata: state.metadata,
        currentFrameIndex: state.currentFrameIndex,
        roi: state.roi,
        preset: state.preset,
        config: state.config,
        defaultConfig: state.defaultConfig,
        isBlurMode: state.isBlurMode,
        blurSettings: state.blurSettings,
        defaultBlurSettings: state.defaultBlurSettings,
        subtitles: state.subtitles,
        clientId: state.clientId,
        allowedExtensions: state.allowedExtensions,
        availablePresets: state.availablePresets,
        availableLanguages: state.availableLanguages
      }),
    }
  )
);
