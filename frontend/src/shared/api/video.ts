import axios from 'axios';
import { API_URL } from './config';
import type { VideoMetadata } from '../../types';

const CHUNK_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Retry network failures and 5xx; client errors (4xx) and aborts fail at once. */
function isRetryable(err: unknown): boolean {
  if (axios.isCancel(err) || !axios.isAxiosError(err)) return false;
  const status = err.response?.status;
  return status === undefined || status >= 500;
}

async function withRetry<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (signal?.aborted || attempt >= CHUNK_RETRIES || !isRetryable(err)) throw err;
      await wait(RETRY_BASE_DELAY_MS * 2 ** attempt, signal);
    }
  }
}

export interface UploadOptions {
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

export const videoApi = {
  getAllowedExtensions: async (): Promise<string[]> => {
    const response = await axios.get(`${API_URL}/video/allowed-extensions`);
    return response.data;
  },

  uploadVideo: async (file: File, { onProgress, signal }: UploadOptions = {}): Promise<VideoMetadata> => {
    const configRes = await axios.get(`${API_URL}/video/config`, { signal });
    const { chunk_size: chunkSize } = configRes.data;

    const totalChunks = Math.ceil(file.size / chunkSize);
    const initRes = await axios.post(`${API_URL}/video/upload/init`, {
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      total_chunks: totalChunks
    }, { signal });
    const { upload_id, urls, storage_filename } = initRes.data;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      await withRetry(() => {
        if (urls && urls.length > 0) {
          return axios.put(urls[i], chunk, {
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            signal,
          });
        }
        const formData = new FormData();
        formData.append('file', chunk);
        formData.append('upload_id', upload_id);
        formData.append('part_number', (i + 1).toString());
        return axios.post(`${API_URL}/video/upload/chunk`, formData, { signal });
      }, signal);

      onProgress?.(Math.round(((i + 1) / totalChunks) * 100));
    }

    const completeRes = await axios.post(`${API_URL}/video/upload/complete`, {
      filename: storage_filename,
      upload_id: upload_id,
      total_chunks: totalChunks
    }, { signal });
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
