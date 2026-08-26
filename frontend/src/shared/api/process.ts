import axios from 'axios';
import { API_URL } from './config';
import type { ProcessConfig, RenderConfig, SubtitleItem, BlurSettings, Preset, Language, OcrSettings, WebSocketMessage } from '../../types';

export const processApi = {
  getPresets: async (): Promise<Preset[]> => {
    const response = await axios.get(`${API_URL}/process/presets`);
    return response.data;
  },

  getLanguages: async (): Promise<Language[]> => {
    const response = await axios.get(`${API_URL}/process/languages`);
    return response.data;
  },

  getDefaultBlurSettings: async (): Promise<BlurSettings> => {
    const response = await axios.get(`${API_URL}/process/blur-defaults`);
    return response.data;
  },

  getDefaultProcessConfig: async (): Promise<OcrSettings> => {
    const response = await axios.get(`${API_URL}/process/process-defaults`);
    return response.data;
  },

  getBlurPreview: async (config: {
    filename: string;
    frame_index: number;
    blur_settings: BlurSettings;
    subtitle_text?: string;
    subtitle_texts?: string[];
  }, signal?: AbortSignal) => {
    const response = await axios.post(`${API_URL}/process/preview_blur`, config, {
      responseType: 'blob',
      signal
    });
    return URL.createObjectURL(response.data);
  },

  startProcessing: async (config: ProcessConfig) => {
    const response = await axios.post<{ status: string; job_id: string }>(
      `${API_URL}/process/start`, config
    );
    return response.data;
  },

  stopProcessing: async (jobId: string) => {
    await axios.post(`${API_URL}/process/stop`, { job_id: jobId });
  },

  importSrt: async (file: File): Promise<SubtitleItem[]> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post<SubtitleItem[]>(`${API_URL}/process/import_srt`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  renderBlurVideo: async (config: RenderConfig) => {
    const response = await axios.post<{ status: string; job_id: string }>(
      `${API_URL}/process/render_blur`, config
    );
    return response.data;
  },

  getSessionStatus: async (clientId: string): Promise<{
    has_active_job: boolean;
    job_id: string | null;
    filename?: string | null;
    kind?: string | null;
    last_state?: WebSocketMessage | null;
  }> => {
    const response = await axios.get(`${API_URL}/session/status/${clientId}`);
    return response.data;
  },

  ackSessionState: async (clientId: string, jobId: string): Promise<{ status: string }> => {
    const response = await axios.post(`${API_URL}/session/ack`, {
      client_id: clientId,
      job_id: jobId,
    });
    return response.data;
  },

  cancelSessionJob: async (jobId: string, clientId: string): Promise<{ status: string }> => {
    const response = await axios.post(`${API_URL}/session/jobs/${jobId}/cancel`, { client_id: clientId });
    return response.data;
  }
};