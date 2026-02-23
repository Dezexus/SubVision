/**
 * API methods related to subtitle processing and video rendering.
 */
import axios from 'axios';
import { API_URL } from './config';
import type { ProcessConfig, RenderConfig, SubtitleItem, BlurSettings, Preset } from '../../types';

export const processApi = {
  getPresets: async (): Promise<Preset[]> => {
    const response = await axios.get(`${API_URL}/process/presets`);
    return response.data;
  },

  getBlurPreview: async (config: {
    filename: string;
    frame_index: number;
    blur_settings: BlurSettings;
    subtitle_text: string;
  }, signal?: AbortSignal) => {
    const response = await axios.post(`${API_URL}/process/preview_blur`, config, {
      responseType: 'blob',
      signal
    });
    return URL.createObjectURL(response.data);
  },

  startProcessing: async (config: ProcessConfig) => {
    const response = await axios.post(`${API_URL}/process/start`, config);
    return response.data;
  },

  stopProcessing: async (clientId: string) => {
    await axios.post(`${API_URL}/process/stop/${clientId}`);
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
    const response = await axios.post(`${API_URL}/process/render_blur`, config);
    return response.data;
  }
};
