import { create } from 'zustand';
import type { SubtitleItem } from '../types';
import { api } from '../services/api';

export interface ProgressData {
  current: number;
  total: number;
  eta: string;
}

export interface ProcessingState {
  isProcessing: boolean;
  stoppedJobId: string | null;
  progress: ProgressData;
  subtitles: SubtitleItem[];
  pastSubtitles: SubtitleItem[][];
  futureSubtitles: SubtitleItem[][];
  logs: string[];
  activeOcrJobId: string | null;
  activeBlurJobId: string | null;
  renderedVideoUrl: string | null;
}

export interface ProcessingActions {
  setProcessing: (isProcessing: boolean) => void;
  setStoppedJobId: (id: string | null) => void;
  setActiveOcrJobId: (id: string | null) => void;
  setActiveBlurJobId: (id: string | null) => void;
  restoreFromStorage: () => void;
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
  reset: () => void;
}

export const useProcessingStore = create<ProcessingState & ProcessingActions>((set, get) => ({
  isProcessing: false,
  stoppedJobId: null,
  progress: { current: 0, total: 0, eta: '--:--' },
  subtitles: [],
  pastSubtitles: [],
  futureSubtitles: [],
  logs: [],
  activeOcrJobId: null,
  activeBlurJobId: null,
  renderedVideoUrl: null,

  setProcessing: (isProcessing) => set({ isProcessing }),
  setStoppedJobId: (id) => set({ stoppedJobId: id }),

  setActiveOcrJobId: (id) => {
    if (id) {
      sessionStorage.setItem('activeOcrJobId', id);
    } else {
      sessionStorage.removeItem('activeOcrJobId');
    }
    set({ activeOcrJobId: id });
  },

  setActiveBlurJobId: (id) => {
    if (id) {
      sessionStorage.setItem('activeBlurJobId', id);
    } else {
      sessionStorage.removeItem('activeBlurJobId');
    }
    set({ activeBlurJobId: id });
  },

  restoreFromStorage: () => {
    const ocr = sessionStorage.getItem('activeOcrJobId');
    const blur = sessionStorage.getItem('activeBlurJobId');
    set({
      activeOcrJobId: ocr || null,
      activeBlurJobId: blur || null,
    });
  },

  addLog: (msg) => set((state) => ({ logs: [...state.logs, msg] })),
  updateProgress: (current, total, eta) => set({ progress: { current, total, eta } }),
  addSubtitle: (sub) => set((state) => ({ subtitles: [...state.subtitles, sub] })),

  setSubtitles: (subs) => set({ subtitles: subs, pastSubtitles: [], futureSubtitles: [] }),

  updateSubtitle: (updatedSub) =>
    set((state) => ({
      subtitles: state.subtitles.map((sub) =>
        sub.id === updatedSub.id ? { ...updatedSub, isEdited: true } : sub
      ),
    })),

  deleteSubtitle: (id) =>
    set((state) => ({
      pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-50),
      futureSubtitles: [],
      subtitles: state.subtitles.filter((sub) => sub.id !== id),
    })),

  mergeSubtitles: (index) =>
    set((state) => {
      const subs = [...state.subtitles];
      if (index < 0 || index >= subs.length - 1) return { subtitles: subs };
      const current = subs[index];
      const next = subs[index + 1];
      const merged: SubtitleItem = {
        ...current,
        end: next.end,
        text: `${current.text} ${next.text}`,
        conf: (current.conf + next.conf) / 2,
        isEdited: true,
      };
      subs.splice(index, 2, merged);
      return {
        pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-50),
        futureSubtitles: [],
        subtitles: subs,
      };
    }),

  setRenderedVideoUrl: (url) => set({ renderedVideoUrl: url }),

  saveHistory: () =>
    set((state) => {
      const lastPast = state.pastSubtitles[state.pastSubtitles.length - 1];
      if (lastPast === state.subtitles) return state;
      return {
        pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-50),
        futureSubtitles: [],
      };
    }),

  undo: () =>
    set((state) => {
      if (state.pastSubtitles.length === 0) return state;
      const previous = state.pastSubtitles[state.pastSubtitles.length - 1];
      return {
        pastSubtitles: state.pastSubtitles.slice(0, -1),
        subtitles: previous,
        futureSubtitles: [state.subtitles, ...state.futureSubtitles],
      };
    }),

  redo: () =>
    set((state) => {
      if (state.futureSubtitles.length === 0) return state;
      const next = state.futureSubtitles[0];
      return {
        pastSubtitles: [...state.pastSubtitles, state.subtitles],
        subtitles: next,
        futureSubtitles: state.futureSubtitles.slice(1),
      };
    }),

  reset: () => {
    const state = get();
    if (state.renderedVideoUrl) {
      const match = state.renderedVideoUrl.match(/\/download\/(.+?)(?:\?|$)/);
      if (match) {
        api.deleteVideo(match[1]).catch(() => {});
      }
    }
    sessionStorage.removeItem('activeOcrJobId');
    sessionStorage.removeItem('activeBlurJobId');
    set({
      isProcessing: false,
      stoppedJobId: null,
      progress: { current: 0, total: 0, eta: '--:--' },
      subtitles: [],
      pastSubtitles: [],
      futureSubtitles: [],
      logs: [],
      activeOcrJobId: null,
      activeBlurJobId: null,
      renderedVideoUrl: null,
    });
  },
}));