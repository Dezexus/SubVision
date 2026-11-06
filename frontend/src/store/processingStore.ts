import { create } from 'zustand';
import type { SubtitleItem } from '../types';

const HISTORY_LIMIT = 50;
const STORAGE_KEY = 'subvision_subtitles';
let persistTimer: ReturnType<typeof setTimeout> | undefined;

function persistSubtitles(subtitles: SubtitleItem[]): void {
  if (persistTimer !== undefined) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = undefined;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(subtitles));
    } catch (error) {
      console.warn('Failed to persist subtitles', error);
    }
  }, 200);
}

function removePersistedSubtitles(): void {
  if (persistTimer !== undefined) {
    clearTimeout(persistTimer);
    persistTimer = undefined;
  }
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear persisted subtitles', error);
  }
}

interface ProcessingState {
  subtitles: SubtitleItem[];
  pastSubtitles: SubtitleItem[][];
  futureSubtitles: SubtitleItem[][];

  isProcessing: boolean;
  activeOcrJobId: string | null;
  activeBlurJobId: string | null;
  stoppedJobId: string | null;
  renderedVideoUrl: string | null;

  logs: string[];
  progress: { current: number; total: number; eta: string };
  error: string | null;

  setSubtitles: (subs: SubtitleItem[]) => void;
  addSubtitle: (sub: SubtitleItem) => void;
  updateSubtitle: (sub: SubtitleItem) => void;
  deleteSubtitle: (id: number) => void;
  mergeSubtitles: (index: number) => void;

  setProcessing: (processing: boolean) => void;
  setActiveOcrJobId: (id: string | null) => void;
  setActiveBlurJobId: (id: string | null) => void;
  setStoppedJobId: (id: string | null) => void;
  setRenderedVideoUrl: (url: string | null) => void;

  undo: () => void;
  redo: () => void;
  saveHistory: () => void;

  restoreFromStorage: () => void;
  reset: () => void;
  resetProgress: () => void;

  addLog: (log: string) => void;
  updateProgress: (current: number, total: number, eta?: string) => void;
  setError: (error: string | null) => void;
}

export const useProcessingStore = create<ProcessingState>()((set, get) => ({
  subtitles: [],
  pastSubtitles: [],
  futureSubtitles: [],

  isProcessing: false,
  activeOcrJobId: null,
  activeBlurJobId: null,
  stoppedJobId: null,
  renderedVideoUrl: null,

  logs: [],
  progress: { current: 0, total: 0, eta: '' },
  error: null,

  saveHistory: () => {
    set((state) => ({
      pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-HISTORY_LIMIT),
      futureSubtitles: []
    }));
  },

  setSubtitles: (subs) => {
    get().saveHistory();
    set({ subtitles: subs });
    persistSubtitles(subs);
  },

  addSubtitle: (sub) => {
    set((state) => ({ subtitles: [...state.subtitles, sub] }));
    persistSubtitles(get().subtitles);
  },

  updateSubtitle: (sub) => {
    const newSubs = get().subtitles.map(s => s.id === sub.id ? { ...sub, isEdited: true } : s);
    set({ subtitles: newSubs });
    persistSubtitles(newSubs);
  },

  deleteSubtitle: (id) => {
    get().saveHistory();
    const newSubs = get().subtitles.filter(s => s.id !== id);
    set({ subtitles: newSubs });
    persistSubtitles(newSubs);
  },

  mergeSubtitles: (index) => {
    const subs = get().subtitles;
    if (index < 0 || index >= subs.length - 1) return;

    get().saveHistory();
    const curr = subs[index];
    const next = subs[index + 1];

    const merged = {
      ...curr,
      end: next.end,
      text: `${curr.text} ${next.text}`.trim(),
      isEdited: true
    };

    const newSubs = [
      ...subs.slice(0, index),
      merged,
      ...subs.slice(index + 2)
    ];

    set({ subtitles: newSubs });
    persistSubtitles(newSubs);
  },

  setProcessing: (isProcessing) => set({ isProcessing }),
  setActiveOcrJobId: (activeOcrJobId) => set({ activeOcrJobId }),
  setActiveBlurJobId: (activeBlurJobId) => set({ activeBlurJobId }),
  setStoppedJobId: (stoppedJobId) => set({ stoppedJobId }),
  setRenderedVideoUrl: (renderedVideoUrl) => set({ renderedVideoUrl }),

  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),

  updateProgress: (current, total, eta = '') => set({
    progress: { current, total, eta }
  }),

  setError: (error) => set({ error }),

  undo: () => {
    const { pastSubtitles, subtitles, futureSubtitles } = get();
    if (pastSubtitles.length === 0) return;

    const previous = pastSubtitles[pastSubtitles.length - 1];
    const newPast = pastSubtitles.slice(0, -1);

    set({
      subtitles: previous,
      pastSubtitles: newPast,
      futureSubtitles: [subtitles, ...futureSubtitles].slice(0, HISTORY_LIMIT)
    });
    persistSubtitles(previous);
  },

  redo: () => {
    const { pastSubtitles, subtitles, futureSubtitles } = get();
    if (futureSubtitles.length === 0) return;

    const next = futureSubtitles[0];
    const newFuture = futureSubtitles.slice(1);

    set({
      subtitles: next,
      pastSubtitles: [...pastSubtitles, subtitles].slice(-HISTORY_LIMIT),
      futureSubtitles: newFuture
    });
    persistSubtitles(next);
  },

  restoreFromStorage: () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          set({ subtitles: parsed, pastSubtitles: [], futureSubtitles: [] });
        }
      }
    } catch (e) {
      console.error('Failed to restore subtitles', e);
    }
  },

  resetProgress: () => {
    set({
      isProcessing: false,
      activeOcrJobId: null,
      activeBlurJobId: null,
      stoppedJobId: null,
      logs: [],
      progress: { current: 0, total: 0, eta: '' },
      error: null
    });
  },

  reset: () => {
    set({
      subtitles: [],
      pastSubtitles: [],
      futureSubtitles: [],
      isProcessing: false,
      activeOcrJobId: null,
      activeBlurJobId: null,
      stoppedJobId: null,
      renderedVideoUrl: null,
      logs: [],
      progress: { current: 0, total: 0, eta: '' },
      error: null
    });
    removePersistedSubtitles();
  }
}));