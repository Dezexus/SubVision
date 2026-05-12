import { create } from 'zustand';
import { getClientId } from '../shared/lib';
import type { VideoMetadata } from '../types';

interface VideoState {
  file: File | null;
  filename: string | null;
  metadata: VideoMetadata | null;
  clientId: string;
  isUploading: boolean;
  uploadProgress: number;
  
  isPreviewMode: boolean;
  previewVolume: number;
  allowedExtensions: string[];
  currentFrameIndex: number;
  roi: [number, number, number, number];

  initializeClientId: () => string;
  restoreVideoState: () => void;
  
  setFile: (file: File | null) => void;
  setMetadata: (metadata: VideoMetadata | null) => void;
  setUploadInfo: (filename: string, metadata: VideoMetadata) => void;
  setUploading: (isUploading: boolean, progress: number) => void;
  
  setPreviewMode: (mode: boolean) => void;
  setPreviewVolume: (vol: number) => void;
  setAllowedExtensions: (exts: string[]) => void;
  setCurrentFrame: (frame: number | ((prev: number) => number)) => void;
  setRoi: (roi: [number, number, number, number]) => void;
  
  reset: () => void;
  resetProject: () => void;
}

/**
 * Zustand store for managing video file state, metadata, and core playback metrics.
 */
export const useVideoStore = create<VideoState>()((set, get) => ({
  file: null,
  filename: null,
  metadata: null,
  clientId: '',
  isUploading: false,
  uploadProgress: 0,
  
  isPreviewMode: false,
  previewVolume: 0.5,
  allowedExtensions: [],
  currentFrameIndex: 0,
  roi: [0, 0, 0, 0],

  initializeClientId: () => {
    const existingId = get().clientId;
    if (existingId) return existingId;
    
    const id = getClientId();
    set({ clientId: id });
    return id;
  },

  restoreVideoState: () => {
    try {
      const saved = localStorage.getItem('subvision_video_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.filename && parsed.metadata) {
          set({ filename: parsed.filename, metadata: parsed.metadata });
        }
      }
    } catch (e) {
      console.error('Failed to restore video state', e);
    }
  },

  setFile: (file) => set({ file }),
  
  setMetadata: (metadata) => {
    set({ metadata });
    if (metadata) {
      localStorage.setItem('subvision_video_state', JSON.stringify({ filename: metadata.filename, metadata }));
    }
  },
  
  setUploadInfo: (filename, metadata) => {
    set({ 
      filename, 
      metadata,
      isUploading: false, 
      uploadProgress: 100 
    });
    localStorage.setItem('subvision_video_state', JSON.stringify({ filename, metadata }));
  },

  setUploading: (isUploading, uploadProgress) => set({ isUploading, uploadProgress }),
  
  setPreviewMode: (isPreviewMode) => set({ isPreviewMode }),
  setPreviewVolume: (previewVolume) => set({ previewVolume }),
  setAllowedExtensions: (allowedExtensions) => set({ allowedExtensions }),
  
  setCurrentFrame: (frame) => set((state) => ({ 
    currentFrameIndex: typeof frame === 'function' ? frame(state.currentFrameIndex) : frame 
  })),
  
  setRoi: (roi) => set({ roi }),

  reset: () => {
    set({
      file: null,
      filename: null,
      metadata: null,
      isUploading: false,
      uploadProgress: 0,
      isPreviewMode: false,
      currentFrameIndex: 0,
      roi: [0, 0, 0, 0]
    });
    localStorage.removeItem('subvision_video_state');
  },
  
  resetProject: () => {
    get().reset();
  }
}));