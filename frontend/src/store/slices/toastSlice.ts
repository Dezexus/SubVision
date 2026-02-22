/**
 * Zustand slice for managing global toast notifications.
 */
import { StateCreator } from 'zustand';
import type { ToastMessage } from '../../types';
import type { AppState } from '../types';

export interface ToastSlice {
  toasts: ToastMessage[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const createToastSlice: StateCreator<AppState, [], [], ToastSlice> = (set) => ({
  toasts: [],
  addToast: (message, type = 'info') => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }));
  },
  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
});
