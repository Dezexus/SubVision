/**
 * API methods related to video uploading and frame fetching.
 */
import axios from 'axios';
import { API_URL } from './config';
import type { VideoMetadata } from '../../types';

export const videoApi = {
  uploadVideo: async (file: File, clientId: string, onProgress?: (pct: number) => void): Promise<VideoMetadata> => {
    const chunkSize = 10 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const uploadId = crypto.randomUUID();

    let lastResponse: any;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('file', chunk);
      formData.append('upload_id', uploadId);
      formData.append('chunk_index', i.toString());
      formData.append('total_chunks', totalChunks.toString());
      formData.append('filename', file.name);
      formData.append('client_id', clientId);

      const response = await axios.post(`${API_URL}/video/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      lastResponse = response.data;

      if (onProgress) {
        onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    return lastResponse as VideoMetadata;
  },

  getFrameBlob: async (filename: string, frameIndex: number, signal?: AbortSignal) => {
    const response = await axios.get(`${API_URL}/video/frame/${filename}/${frameIndex}`, {
      responseType: 'blob',
      signal
    });
    return URL.createObjectURL(response.data);
  },

  getPreview: async (config: {
    filename: string;
    frame_index: number;
    roi: number[];
    clahe_limit: number;
    scale_factor: number;
    denoise: number;
  }, signal?: AbortSignal) => {
    const response = await axios.post(`${API_URL}/video/preview`, config, {
      responseType: 'blob',
      signal
    });
    return URL.createObjectURL(response.data);
  }
};
