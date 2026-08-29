import { create } from 'zustand';
import type { EmotionAnalysisSettings, SpeakerProfileOverride } from '../types/emotion';
import {
  defaultEmotionAnalysisSettings,
  loadLocalEmotionSettings,
  saveLocalEmotionSettings,
} from '../features/admin/emotionSettingsMeta';

interface EmotionExportState {
  settings: EmotionAnalysisSettings;
  activeEmotionJobId: string | null;
  speakerProfileOverrides: Record<string, SpeakerProfileOverride>;
  setSettings: (patch: Partial<EmotionAnalysisSettings>) => void;
  setExportSettings: (patch: Partial<EmotionAnalysisSettings['export']>) => void;
  setDiarizationSettings: (patch: Partial<EmotionAnalysisSettings['diarization']>) => void;
  setGenderSettings: (patch: Partial<EmotionAnalysisSettings['gender']>) => void;
  setTextSentimentSettings: (patch: Partial<EmotionAnalysisSettings['text_sentiment']>) => void;
  setJsonFormatSettings: (patch: Partial<EmotionAnalysisSettings['json_format']>) => void;
  setSpeakerProfileOverride: (speakerId: string, patch: Partial<SpeakerProfileOverride> | null) => void;
  setSpeakerProfileOverrides: (overrides: Record<string, SpeakerProfileOverride>) => void;
  clearSpeakerProfileOverrides: () => void;
  loadDefaults: (server: EmotionAnalysisSettings) => void;
  resetToServer: (server: EmotionAnalysisSettings) => void;
  persistLocal: () => void;
  setActiveEmotionJobId: (id: string | null) => void;
}

export const useEmotionExportStore = create<EmotionExportState>((set, get) => ({
  settings: loadLocalEmotionSettings(),
  activeEmotionJobId: null,
  speakerProfileOverrides: {},

  setSettings: (patch) =>
    set((s) => ({
      settings: {
        export: { ...s.settings.export, ...patch.export },
        diarization: { ...s.settings.diarization, ...patch.diarization },
        gender: { ...s.settings.gender, ...patch.gender },
        text_sentiment: { ...s.settings.text_sentiment, ...patch.text_sentiment },
        json_format: { ...s.settings.json_format, ...patch.json_format },
      },
    })),

  setExportSettings: (patch) =>
    set((s) => ({
      settings: {
        ...s.settings,
        export: { ...s.settings.export, ...patch },
        diarization: patch.analyze_speakers
          ? { ...s.settings.diarization, enabled: true }
          : s.settings.diarization,
        gender: patch.analyze_speakers && s.settings.gender.enabled
          ? s.settings.gender
          : s.settings.gender,
      },
    })),

  setDiarizationSettings: (patch) =>
    set((s) => ({
      settings: { ...s.settings, diarization: { ...s.settings.diarization, ...patch } },
    })),

  setGenderSettings: (patch) =>
    set((s) => ({
      settings: { ...s.settings, gender: { ...s.settings.gender, ...patch } },
    })),

  setTextSentimentSettings: (patch) =>
    set((s) => ({
      settings: { ...s.settings, text_sentiment: { ...s.settings.text_sentiment, ...patch } },
    })),

  setJsonFormatSettings: (patch) =>
    set((s) => ({
      settings: { ...s.settings, json_format: { ...s.settings.json_format, ...patch } },
    })),

  setSpeakerProfileOverride: (speakerId, patch) =>
    set((s) => {
      const next = { ...s.speakerProfileOverrides };
      if (patch === null) delete next[speakerId];
      else next[speakerId] = { ...next[speakerId], ...patch };
      return { speakerProfileOverrides: next };
    }),

  setSpeakerProfileOverrides: (overrides) => set({ speakerProfileOverrides: overrides }),

  clearSpeakerProfileOverrides: () => set({ speakerProfileOverrides: {} }),

  loadDefaults: (server) =>
    set((s) => ({
      settings: {
        export: { ...server.export, ...s.settings.export },
        diarization: { ...server.diarization, ...s.settings.diarization },
        gender: { ...server.gender, ...s.settings.gender },
        text_sentiment: { ...server.text_sentiment, ...s.settings.text_sentiment },
        json_format: { ...server.json_format, ...s.settings.json_format },
      },
    })),

  resetToServer: (server) => set({ settings: server }),

  persistLocal: () => saveLocalEmotionSettings(get().settings),

  setActiveEmotionJobId: (activeEmotionJobId) => set({ activeEmotionJobId }),
}));

export { defaultEmotionAnalysisSettings };
