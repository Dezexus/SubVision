/**
 * Types definition for the modular Zustand store.
 */
import type { VideoSlice } from './slices/videoSlice';
import type { ConfigSlice } from './slices/configSlice';
import type { BlurSlice } from './slices/blurSlice';
import type { ProcessSlice } from './slices/processSlice';
import type { ToastSlice } from './slices/toastSlice';

export type AppState = VideoSlice & ConfigSlice & BlurSlice & ProcessSlice & ToastSlice;
