import axios from 'axios';
import type { ProcessConfig, VideoMetadata } from '../types';

// Если вы запускаете локально, Vite проксирует или указываем прямой URL
const API_BASE = 'http://localhost:7860/api';

export const api = {
  // Загрузка видео
  uploadVideo: async (file: File): Promise<VideoMetadata> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post<VideoMetadata>(`${API_BASE}/video/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Получение URL кадра (не запрос, а генератор ссылки)
  getFrameUrl: (filename: string, frameIndex: number) => {
    return `${API_BASE}/video/frame/${filename}/${frameIndex}`;
  },

  // Получение превью с фильтрами
  getPreview: async (config: {
    filename: string;
    frame_index: number;
    roi: number[];
    clahe_limit: number;
    scale_factor: number;
    denoise: number;
  }) => {
    const response = await axios.post(`${API_BASE}/video/preview`, config, {
      responseType: 'blob', // Важно для картинки
    });
    return URL.createObjectURL(response.data);
  },

  // Старт процесса
  startProcessing: async (config: ProcessConfig) => {
    const response = await axios.post(`${API_BASE}/process/start`, config);
    return response.data;
  },

  // Стоп
  stopProcessing: async (clientId: string) => {
    await axios.post(`${API_BASE}/process/stop/${clientId}`);
  }
};
