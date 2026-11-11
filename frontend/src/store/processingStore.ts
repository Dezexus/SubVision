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

export type SubtitlePatch = Partial<Omit<SubtitleItem, 'id'>>;

interface ProcessingState {
  subtitles: SubtitleItem[];
  pastSubtitles: SubtitleItem[][];
  futureSubtitles: SubtitleItem[][];
  /** Set by `beginEdit`; the next `updateSubtitle` records one history step. */
  editPending: boolean;

  isProcessing: boolean;
  activeOcrJobId: string | null;
  activeBlurJobId: string | null;
  stoppedJobId: string | null;
  renderedVideoUrl: string | null;

  progress: { current: number; total: number; eta: string };

  /** Server result: replaces the list and starts a fresh undo history. */
  setSubtitles: (subs: SubtitleItem[]) => void;
  /** User action (e.g. SRT import): replaces the list as one undoable step. */
  importSubtitles: (subs: SubtitleItem[]) => void;
  addSubtitle: (sub: SubtitleItem) => void;
  /** User edit: patches the current item by id and marks it edited. */
  updateSubtitle: (id: number, patch: SubtitlePatch) => void;
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
  /** Start a continuous edit (focus, drag); history is saved on the first actual change. */
  beginEdit: () => void;
  endEdit: () => void;

  restoreFromStorage: () => void;
  reset: () => void;

  updateProgress: (current: number, total: number, eta?: string) => void;
}

const initialState = {
  subtitles: [] as SubtitleItem[],
  pastSubtitles: [] as SubtitleItem[][],
  futureSubtitles: [] as SubtitleItem[][],
  editPending: false,
  isProcessing: false,
  activeOcrJobId: null,
  activeBlurJobId: null,
  stoppedJobId: null,
  renderedVideoUrl: null,
  progress: { current: 0, total: 0, eta: '' },
};

export const useProcessingStore = create<ProcessingState>()((set, get) => ({
  ...initialState,

  saveHistory: () => {
    set((state) => ({
      pastSubtitles: [...state.pastSubtitles, state.subtitles].slice(-HISTORY_LIMIT),
      futureSubtitles: [],
      editPending: false,
    }));
  },

  beginEdit: () => set({ editPending: true }),
  endEdit: () => set({ editPending: false }),

  setSubtitles: (subs) => {
    set({ subtitles: subs, pastSubtitles: [], futureSubtitles: [], editPending: false });
    persistSubtitles(subs);
  },

  importSubtitles: (subs) => {
    get().saveHistory();
    set({ subtitles: subs });
    persistSubtitles(subs);
  },

  addSubtitle: (sub) => {
    set((state) => ({ subtitles: [...state.subtitles, sub] }));
    persistSubtitles(get().subtitles);
  },

  updateSubtitle: (id, patch) => {
    if (!get().subtitles.some((s) => s.id === id)) return;
    if (get().editPending) get().saveHistory();
    const newSubs = get().subtitles.map((s) =>
      s.id === id ? { ...s, ...patch, isEdited: true } : s,
    );
    set({ subtitles: newSubs });
    persistSubtitles(newSubs);
  },

  deleteSubtitle: (id) => {
    get().saveHistory();
    const newSubs = get().subtitles.filter((s) => s.id !== id);
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
      isEdited: true,
    };

    const newSubs = [...subs.slice(0, index), merged, ...subs.slice(index + 2)];

    set({ subtitles: newSubs });
    persistSubtitles(newSubs);
  },

  setProcessing: (isProcessing) => set({ isProcessing }),
  setActiveOcrJobId: (activeOcrJobId) => set({ activeOcrJobId }),
  setActiveBlurJobId: (activeBlurJobId) => set({ activeBlurJobId }),
  setStoppedJobId: (stoppedJobId) => set({ stoppedJobId }),
  setRenderedVideoUrl: (renderedVideoUrl) => set({ renderedVideoUrl }),

  updateProgress: (current, total, eta = '') => set({ progress: { current, total, eta } }),

  undo: () => {
    const { pastSubtitles, subtitles, futureSubtitles } = get();
    if (pastSubtitles.length === 0) return;

    const previous = pastSubtitles[pastSubtitles.length - 1];
    set({
      subtitles: previous,
      pastSubtitles: pastSubtitles.slice(0, -1),
      futureSubtitles: [subtitles, ...futureSubtitles].slice(0, HISTORY_LIMIT),
    });
    persistSubtitles(previous);
  },

  redo: () => {
    const { pastSubtitles, subtitles, futureSubtitles } = get();
    if (futureSubtitles.length === 0) return;

    const next = futureSubtitles[0];
    set({
      subtitles: next,
      pastSubtitles: [...pastSubtitles, subtitles].slice(-HISTORY_LIMIT),
      futureSubtitles: futureSubtitles.slice(1),
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

  reset: () => {
    set({ ...initialState, progress: { current: 0, total: 0, eta: '' } });
    removePersistedSubtitles();
  },
}));
