import axios from 'axios';
import { API_URL } from './config';
import type { VideoMetadata } from '../../types';

export const videoApi = {
  getAllowedExtensions: async (): Promise<string[]> => {
    const response = await axios.get(`${API_URL}/video/allowed-extensions`);
    return response.data;
  },

  uploadVideo: async (file: File, clientId: string, onProgress?: (pct: number) => void): Promise<VideoMetadata> => {
    const chunkSize = 10 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / chunkSize);
    const initRes = await axios.post(`${API_URL}/video/upload/init`, {
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      total_chunks: totalChunks
    });
    const { upload_id, urls, storage_filename } = initRes.data;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      if (urls && urls.length > 0) {
        await axios.put(urls[i], chunk, {
          headers: { 'Content-Type': file.type || 'application/octet-stream' }
        });
      } else {
        const formData = new FormData();
        formData.append('file', chunk);
        formData.append('upload_id', upload_id);
        formData.append('part_number', (i + 1).toString());
        await axios.post(`${API_URL}/video/upload/chunk`, formData);
      }

      if (onProgress) {
        onProgress(Math.round(((i + 1) / totalChunks) * 100));
      }
    }

    const completePayload: any = {
      filename: storage_filename,
      upload_id: upload_id,
      total_chunks: totalChunks
    };

    const completeRes = await axios.post(`${API_URL}/video/upload/complete`, completePayload);
    return completeRes.data as VideoMetadata;
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
  },

  deleteVideo: async (filename: string) => {
    await axios.delete(`${API_URL}/video/delete/${filename}`);
  }
};