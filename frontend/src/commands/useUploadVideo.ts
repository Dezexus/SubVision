import { useState, useCallback } from 'react';
import { useVideoStore } from '../store/videoStore';
import { useProcessingStore } from '../store/processingStore';
import { useBlurStore } from '../store/blurStore';
import { api } from '../services/api';
import { useUIStore } from '../store/uiStore';
import { clearFrameCache } from '../features/editor/hooks/useVideoFrame';

export function useUploadVideo() {
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const setMetadata = useVideoStore((s) => s.setMetadata);
  const setFile = useVideoStore((s) => s.setFile);
  const resetProcessing = useProcessingStore((s) => s.reset);
  const resetBlur = useBlurStore((s) => s.reset);
  const addToast = useUIStore((s) => s.addToast);
  const allowedExtensions = useVideoStore((s) => s.allowedExtensions);

  const execute = useCallback(async (file: File) => {
    const validExtensions = allowedExtensions.length > 0
      ? allowedExtensions
      : ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
    const hasValidExt = validExtensions.some((ext) =>
      file.name.toLowerCase().endsWith(ext)
    );
    if (!hasValidExt && !file.type.startsWith('video/')) {
      const msg = `Invalid file type. Please upload ${validExtensions
        .map((e) => e.replace('.', '').toUpperCase())
        .join(', ')}.`;
      addToast(msg, 'error');
      throw new Error(msg);
    }

    resetProcessing();
    resetBlur();
    clearFrameCache();

    setIsLoading(true);
    setUploadProgress(0);
    try {
      const metadata = await api.uploadVideo(file, '', (pct) => setUploadProgress(pct));
      setMetadata(metadata);
      setFile(file);
      addToast('Video uploaded successfully', 'success');
      return metadata;
    } catch (err: any) {
      const msg = err.code === 'ERR_NETWORK'
        ? 'Server is offline. Please start the backend.'
        : (err.response?.data?.detail || 'Failed to process video.');
      addToast(msg, 'error');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [allowedExtensions, setFile, setMetadata, resetProcessing, resetBlur, addToast]);

  return { execute, isLoading, progress: uploadProgress };
}