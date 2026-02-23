/**
 * API methods related to video uploading, resuming, and frame fetching.
 */
import axios from 'axios';
import { API_URL } from './config';
import type { VideoMetadata } from '../../types';

export const videoApi = {
  uploadVideo: async (file: File, clientId: string, onProgress?: (pct: number) => void): Promise<VideoMetadata> => {
    const chunkSize = 10 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);

    const rawId = `${file.name}-${file.size}-${file.lastModified}`;
    const uploadId = rawId.replace(/[^a-zA-Z0-9\-]/g, '');

    const statusRes = await axios.get(`${API_URL}/video/upload/status/${uploadId}`, {
      params: { total_chunks: totalChunks }
    });

    let missingChunks: number[] = statusRes.data.missing_chunks;

    if (missingChunks.length === 0) {
      missingChunks = [totalChunks - 1];
    }

    let lastResponse: any;
    let uploadedCount = totalChunks - missingChunks.length;

    if (onProgress && uploadedCount > 0) {
      onProgress(Math.round((uploadedCount / totalChunks) * 100));
    }

    for (let i = 0; i < totalChunks; i++) {
      if (!missingChunks.includes(i)) {
        continue;
      }

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
      uploadedCount++;

      if (onProgress) {
        onProgress(Math.round((uploadedCount / totalChunks) * 100));
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
    scale_factor: number;
  }, signal?: AbortSignal) => {
    const response = await axios.post(`${API_URL}/video/preview`, config, {
      responseType: 'blob',
      signal
    });
    return URL.createObjectURL(response.data);
  }
};
