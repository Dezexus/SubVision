import { create } from 'zustand';
import { SubtitleItem } from '../types';

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
      pastSubtitles: [...state.pastSubtitles, state.subtitles],
      futureSubtitles: []
    }));
  },

  setSubtitles: (subs) => {
    get().saveHistory();
    set({ subtitles: subs });
    localStorage.setItem('subvision_subtitles', JSON.stringify(subs));
  },

  addSubtitle: (sub) => {
    set((state) => ({ subtitles: [...state.subtitles, sub] }));
    localStorage.setItem('subvision_subtitles', JSON.stringify(get().subtitles));
  },

  updateSubtitle: (sub) => {
    const newSubs = get().subtitles.map(s => s.id === sub.id ? { ...sub, isEdited: true } : s);
    set({ subtitles: newSubs });
    localStorage.setItem('subvision_subtitles', JSON.stringify(newSubs));
  },

  deleteSubtitle: (id) => {
    get().saveHistory();
    const newSubs = get().subtitles.filter(s => s.id !== id);
    set({ subtitles: newSubs });
    localStorage.setItem('subvision_subtitles', JSON.stringify(newSubs));
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
    localStorage.setItem('subvision_subtitles', JSON.stringify(newSubs));
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
      futureSubtitles: [subtitles, ...futureSubtitles]
    });
    localStorage.setItem('subvision_subtitles', JSON.stringify(previous));
  },

  redo: () => {
    const { pastSubtitles, subtitles, futureSubtitles } = get();
    if (futureSubtitles.length === 0) return;
    
    const next = futureSubtitles[0];
    const newFuture = futureSubtitles.slice(1);
    
    set({
      subtitles: next,
      pastSubtitles: [...pastSubtitles, subtitles],
      futureSubtitles: newFuture
    });
    localStorage.setItem('subvision_subtitles', JSON.stringify(next));
  },

  restoreFromStorage: () => {
    try {
      const saved = localStorage.getItem('subvision_subtitles');
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
    localStorage.removeItem('subvision_subtitles');
  }
}));