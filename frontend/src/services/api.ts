// A centralized object for all backend API communications.
import axios from 'axios';
import type { ProcessConfig, VideoMetadata } from '../types';

// Use environment variable for the API URL, falling back to localhost for development.
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7860';
const API_URL = `${API_BASE}/api`;

export const api = {
  /** Uploads a video file and returns its metadata. */
  uploadVideo: async (file: File): Promise<VideoMetadata> => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post<VideoMetadata>(`${API_URL}/video/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  /** Constructs the URL for fetching a specific raw video frame. */
  getFrameUrl: (filename: string, frameIndex: number) => {
    return `${API_URL}/video/frame/${filename}/${frameIndex}`;
  },

  /** Fetches a processed preview image based on current filter settings. */
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
    // Create a temporary URL from the returned image blob
    return URL.createObjectURL(response.data);
  },

  /** Sends the configuration to the backend to start the OCR process. */
  startProcessing: async (config: ProcessConfig) => {
    const response = await axios.post(`${API_URL}/process/start`, config);
    return response.data;
  },

  /** Sends a request to stop the currently running OCR process for a client. */
  stopProcessing: async (clientId: string) => {
    await axios.post(`${API_URL}/process/stop/${clientId}`);
  }
};
