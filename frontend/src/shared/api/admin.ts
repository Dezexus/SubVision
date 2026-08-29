import axios from 'axios';
import { API_URL } from './config';
import type { EmotionAnalysisSettings } from '../../types/emotion';

const adminHeaders = (key: string) => ({ headers: { 'X-Admin-Key': key } });

export const adminApi = {
  getStatus: async (adminKey: string) => {
    const { data } = await axios.get(`${API_URL}/admin/status`, adminHeaders(adminKey));
    return data as {
      redis: boolean;
      hf_token_configured: boolean;
      gigaam_available: boolean;
      gigaam_weights_cached: boolean;
      pyannote_available: boolean;
      emotion_export_enabled: boolean;
    };
  },

  getEmotionConfig: async (adminKey: string) => {
    const { data } = await axios.get(`${API_URL}/admin/config/emotion-export`, adminHeaders(adminKey));
    return data as {
      env_defaults: EmotionAnalysisSettings;
      admin_patch: Record<string, unknown> | null;
      effective: EmotionAnalysisSettings;
    };
  },

  patchEmotionConfig: async (adminKey: string, patch: Partial<EmotionAnalysisSettings>) => {
    const { data } = await axios.patch(
      `${API_URL}/admin/config/emotion-export`,
      patch,
      adminHeaders(adminKey),
    );
    return data;
  },

  resetEmotionConfig: async (adminKey: string) => {
    const { data } = await axios.post(
      `${API_URL}/admin/config/emotion-export/reset`,
      {},
      adminHeaders(adminKey),
    );
    return data;
  },

  clearEmotionCache: async (adminKey: string) => {
    const { data } = await axios.post(`${API_URL}/admin/cache/emotion/clear`, {}, adminHeaders(adminKey));
    return data as { deleted_keys: number };
  },

  getRecentJobs: async (adminKey: string) => {
    const { data } = await axios.get(`${API_URL}/admin/jobs/recent`, adminHeaders(adminKey));
    return data as { jobs: Array<Record<string, unknown>> };
  },
};
