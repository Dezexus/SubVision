import { create } from 'zustand';
import type { EmotionAnalysisSettings } from '../types/emotion';
import {
  loadLocalEmotionSettings,
  saveLocalEmotionSettings,
} from '../features/admin/emotionSettingsMeta';

export interface PendingEmotionDownload {
  url: string;
  filename: string;
}

interface EmotionExportState {
  settings: EmotionAnalysisSettings;
  activeEmotionJobId: string | null;
  pendingDownload: PendingEmotionDownload | null;
  setExportSettings: (patch: Partial<EmotionAnalysisSettings['export']>) => void;
  setTextSentimentSettings: (patch: Partial<EmotionAnalysisSettings['text_sentiment']>) => void;
  setJsonFormatSettings: (patch: Partial<EmotionAnalysisSettings['json_format']>) => void;
  loadDefaults: (server: EmotionAnalysisSettings) => void;
  persistLocal: () => void;
  setActiveEmotionJobId: (id: string | null) => void;
  setPendingDownload: (download: PendingEmotionDownload) => void;
  clearPendingDownload: () => void;
}

export const useEmotionExportStore = create<EmotionExportState>((set, get) => ({
  settings: loadLocalEmotionSettings(),
  activeEmotionJobId: null,
  pendingDownload: null,

  setExportSettings: (patch) =>
    set((s) => ({
      settings: {
        ...s.settings,
        export: { ...s.settings.export, ...patch },
      },
    })),

  setTextSentimentSettings: (patch) =>
    set((s) => ({
      settings: { ...s.settings, text_sentiment: { ...s.settings.text_sentiment, ...patch } },
    })),

  setJsonFormatSettings: (patch) =>
    set((s) => ({
      settings: { ...s.settings, json_format: { ...s.settings.json_format, ...patch } },
    })),

  loadDefaults: (server) =>
    set((s) => ({
      settings: {
        export: { ...server.export, ...s.settings.export },
        text_sentiment: { ...server.text_sentiment, ...s.settings.text_sentiment },
        json_format: { ...server.json_format, ...s.settings.json_format },
      },
    })),

  persistLocal: () => saveLocalEmotionSettings(get().settings),

  setActiveEmotionJobId: (activeEmotionJobId) => set({ activeEmotionJobId }),

  setPendingDownload: (pendingDownload) => set({ pendingDownload }),

  clearPendingDownload: () => set({ pendingDownload: null }),
}));
