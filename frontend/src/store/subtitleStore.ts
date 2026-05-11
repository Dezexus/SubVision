/**
 * Zustand store for managing subtitle entities, history, and local storage persistence.
 */
import { create } from 'zustand';
import type { SubtitleItem } from '../types';

interface SubtitleState {
  subtitles: SubtitleItem[];
  pastSubtitles: SubtitleItem[][];
  futureSubtitles: SubtitleItem[][];
  
  setSubtitles: (subs: SubtitleItem[]) => void;
  addSubtitle: (sub: SubtitleItem) => void;
  updateSubtitle: (sub: SubtitleItem) => void;
  deleteSubtitle: (id: number) => void;
  mergeSubtitles: (index: number) => void;
  
  undo: () => void;
  redo: () => void;
  saveHistory: () => void;
  restoreFromStorage: () => void;
  reset: () => void;
}

export const useSubtitleStore = create<SubtitleState>()((set, get) => ({
  subtitles: [],
  pastSubtitles: [],
  futureSubtitles: [],

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

  reset: () => {
    set({ 
      subtitles: [], 
      pastSubtitles: [],
      futureSubtitles: []
    });
    localStorage.removeItem('subvision_subtitles');
  }
}));