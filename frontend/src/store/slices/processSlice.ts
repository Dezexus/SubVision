/**
 * Zustand slice for processing state, progress, and subtitles.
 */
import { StateCreator } from 'zustand';
import type { SubtitleItem } from '../../types';
import type { AppState } from '../types';

const getOrCreateClientId = (): string => {
  const stored = sessionStorage.getItem('subvision_client_id');
  if (stored) return stored;

  const newId = crypto.randomUUID();
  sessionStorage.setItem('subvision_client_id', newId);
  return newId;
};

export interface ProcessSlice {
  isProcessing: boolean;
  progress: { current: number; total: number; eta: string };
  subtitles: SubtitleItem[];
  logs: string[];
  clientId: string;
  renderedVideoUrl: string | null;
  setProcessing: (isProcessing: boolean) => void;
  addLog: (msg: string) => void;
  updateProgress: (current: number, total: number, eta: string) => void;
  addSubtitle: (sub: SubtitleItem) => void;
  setSubtitles: (subs: SubtitleItem[]) => void;
  updateSubtitle: (sub: SubtitleItem) => void;
  deleteSubtitle: (id: number) => void;
  mergeSubtitles: (index: number) => void;
  setRenderedVideoUrl: (url: string | null) => void;
}

export const createProcessSlice: StateCreator<AppState, [], [], ProcessSlice> = (set) => ({
  isProcessing: false,
  progress: { current: 0, total: 0, eta: '--:--' },
  subtitles: [],
  logs: [],
  clientId: getOrCreateClientId(),
  renderedVideoUrl: null,
  setProcessing: (isProcessing) => set({ isProcessing }),
  addLog: (msg) => set((state) => ({ logs: [...state.logs, msg] })),
  updateProgress: (current, total, eta) => set({ progress: { current, total, eta } }),
  addSubtitle: (sub) => set((state) => ({ subtitles: [...state.subtitles, sub] })),
  setSubtitles: (subs) => set({ subtitles: subs }),
  updateSubtitle: (updatedSub) => set((state) => ({
    subtitles: state.subtitles.map(sub =>
      sub.id === updatedSub.id ? { ...updatedSub, isEdited: true } : sub
    )
  })),
  deleteSubtitle: (id) => set((state) => ({
    subtitles: state.subtitles.filter(sub => sub.id !== id)
  })),
  mergeSubtitles: (index) => set((state) => {
    const subs = [...state.subtitles];
    if (index < 0 || index >= subs.length - 1) return { subtitles: subs };

    const current = subs[index];
    const next = subs[index + 1];

    const merged: SubtitleItem = {
      ...current,
      end: next.end,
      text: `${current.text} ${next.text}`,
      conf: (current.conf + next.conf) / 2,
      isEdited: true
    };

    subs.splice(index, 2, merged);
    return { subtitles: subs };
  }),
  setRenderedVideoUrl: (url) => set({ renderedVideoUrl: url }),
});
