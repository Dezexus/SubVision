/**
 * API methods related to direct S3 multipart video uploading and frame fetching.
 */
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
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');

    const initRes = await axios.post(`${API_URL}/video/upload/init`, {
        filename: safeFilename,
        content_type: file.type || 'application/octet-stream',
        total_chunks: totalChunks
    });

    const { upload_id, urls } = initRes.data;
    const parts = [];

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        if (urls && urls.length > 0) {
            const uploadUrl = urls[i];
            const chunkRes = await axios.put(uploadUrl, chunk, {
                headers: { 'Content-Type': file.type || 'application/octet-stream' }
            });
            const etag = chunkRes.headers['etag'] || chunkRes.headers['Etag'] || '';
            parts.push({ PartNumber: i + 1, ETag: etag.replace(/"/g, '') });
        } else {
            parts.push({ PartNumber: i + 1, ETag: `local_${i}` });
        }

        if (onProgress) {
            onProgress(Math.round(((i + 1) / totalChunks) * 100));
        }
    }

    const completeRes = await axios.post(`${API_URL}/video/upload/complete`, {
        filename: safeFilename,
        upload_id: upload_id,
        parts: parts
    });

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
  }
};
