import { create } from 'zustand';
import type { ToastMessage } from '../types';

export interface UIState {
  toasts: ToastMessage[];
}

export interface UIActions {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  toasts: [],

  addToast: (message, type = 'info') => {
    const id = crypto.randomUUID();
    set((state) => {
      // Skip a repeat of a toast already on screen; keep at most three.
      if (state.toasts.some((t) => t.message === message && t.type === type)) return {};
      return { toasts: [...state.toasts, { id, type, message }].slice(-3) };
    });
  },

  removeToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));