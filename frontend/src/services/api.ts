import axios from 'axios';
import type { ProcessConfig, VideoMetadata, RenderConfig, SubtitleItem, BlurSettings } from '../types';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7860';
const API_URL = `${API_BASE}/api`;

export const api = {
  uploadVideo: async (file: File): Promise<VideoMetadata> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post<VideoMetadata>(`${API_URL}/video/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getFrameUrl: (filename: string, frameIndex: number) => {
    return `${API_URL}/video/frame/${filename}/${frameIndex}`;
  },

  getPreview: async (config: {
    filename: string;
    frame_index: number;
    roi: number[];
    clahe_limit: number;
    scale_factor: number;
    denoise: number;
  }) => {
    const response = await axios.post(`${API_URL}/video/preview`, config, {
      responseType: 'blob',
    });
    return URL.createObjectURL(response.data);
  },

  // New endpoint for real-time blur preview
  getBlurPreview: async (config: {
    filename: string;
    frame_index: number;
    blur_settings: BlurSettings;
    subtitle_text: string;
  }) => {
    const response = await axios.post(`${API_URL}/process/preview_blur`, config, {
      responseType: 'blob'
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
