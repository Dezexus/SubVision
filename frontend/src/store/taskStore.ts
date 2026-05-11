/**
 * Zustand store for managing background processing tasks, jobs, logs, and progress indicators.
 */
import { create } from 'zustand';

interface TaskState {
  isProcessing: boolean;
  activeOcrJobId: string | null;
  activeBlurJobId: string | null;
  stoppedJobId: string | null;
  renderedVideoUrl: string | null;
  logs: string[];
  progress: { current: number; total: number; eta: string };
  error: string | null;

  setProcessing: (processing: boolean) => void;
  setActiveOcrJobId: (id: string | null) => void;
  setActiveBlurJobId: (id: string | null) => void;
  setStoppedJobId: (id: string | null) => void;
  setRenderedVideoUrl: (url: string | null) => void;
  
  addLog: (log: string) => void;
  updateProgress: (current: number, total: number, eta?: string) => void;
  setError: (error: string | null) => void;
  
  resetProgress: () => void;
  reset: () => void;
}

export const useTaskStore = create<TaskState>()((set) => ({
  isProcessing: false,
  activeOcrJobId: null,
  activeBlurJobId: null,
  stoppedJobId: null,
  renderedVideoUrl: null,
  
  logs: [],
  progress: { current: 0, total: 0, eta: '' },
  error: null,

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
      isProcessing: false, 
      activeOcrJobId: null, 
      activeBlurJobId: null,
      stoppedJobId: null,
      renderedVideoUrl: null,
      logs: [],
      progress: { current: 0, total: 0, eta: '' },
      error: null
    });
  }
}));