/**
 * Main application store combining all modular slices.
 */
import { create } from 'zustand';
import type { AppState } from './types';
import { createVideoSlice } from './slices/videoSlice';
import { createConfigSlice } from './slices/configSlice';
import { createBlurSlice } from './slices/blurSlice';
import { createProcessSlice } from './slices/processSlice';
import { createToastSlice } from './slices/toastSlice';

export const useAppStore = create<AppState>()((...a) => ({
  ...createVideoSlice(...a),
  ...createConfigSlice(...a),
  ...createBlurSlice(...a),
  ...createProcessSlice(...a),
  ...createToastSlice(...a),
}));
