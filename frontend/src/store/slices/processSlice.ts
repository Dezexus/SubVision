/**
 * Zustand slice for processing state, history tracking (undo/redo), and subtitles.
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
  pastSubtitles: SubtitleItem[][];
  futureSubtitles: SubtitleItem[][];
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
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export const createProcessSlice: StateCreator<AppState, [], [], ProcessSlice> = (set) => ({
  isProcessing: false,
  progress: { current: 0, total: 0, eta: '--:--' },
  subtitles: [],
  pastSubtitles: [],
  futureSubtitles: [],
  logs: [],
  clientId: getOrCreateClientId(),
  renderedVideoUrl: null,

  setProcessing: (isProcessing) => set({ isProcessing }),
  addLog: (msg) => set((state) => ({ logs: [...state.logs, msg] })),
  updateProgress: (current, total, eta) => set({ progress: { current, total, eta } }),
  addSubtitle: (sub) => set((state) => ({ subtitles: [...state.subtitles, sub] })),

  setSubtitles: (subs) => set({ subtitles: subs, pastSubtitles: [], futureSubtitles: [] }),

  saveHistory: () => set((state) => {
    const lastPast = state.pastSubtitles[state.pastSubtitles.length - 1];
    if (lastPast === state.subtitles) return state; // Prevent duplicate history states
    return {
      pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-50), // Keep last 50 edits
      futureSubtitles: []
    };
  }),

  undo: () => set((state) => {
    if (state.pastSubtitles.length === 0) return state;
    const previous = state.pastSubtitles[state.pastSubtitles.length - 1];
    const newPast = state.pastSubtitles.slice(0, -1);
    return {
      pastSubtitles: newPast,
      subtitles: previous,
      futureSubtitles: [state.subtitles, ...state.futureSubtitles],
    };
  }),

  redo: () => set((state) => {
    if (state.futureSubtitles.length === 0) return state;
    const next = state.futureSubtitles[0];
    const newFuture = state.futureSubtitles.slice(1);
    return {
      pastSubtitles: [...state.pastSubtitles, state.subtitles],
      subtitles: next,
      futureSubtitles: newFuture,
    };
  }),

  updateSubtitle: (updatedSub) => set((state) => ({
    subtitles: state.subtitles.map(sub =>
      sub.id === updatedSub.id ? { ...updatedSub, isEdited: true } : sub
    )
  })),

  deleteSubtitle: (id) => set((state) => ({
    pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-50),
    futureSubtitles: [],
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
    return {
      pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-50),
      futureSubtitles: [],
      subtitles: subs
    };
  }),

  setRenderedVideoUrl: (url) => set({ renderedVideoUrl: url }),
});
