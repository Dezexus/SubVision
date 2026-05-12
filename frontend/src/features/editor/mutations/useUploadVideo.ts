import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { useBlurStore } from '../../../store/blurStore';
import { api } from '../../../shared/api';
import { useUIStore } from '../../../store/uiStore';
import { clearFrameCache } from '../hooks/useVideoFrame';
import { useAllowedExtensionsQuery } from '../queries/useAllowedExtensionsQuery';

/**
 * Mutation hook for uploading a video file and initializing the project state.
 */
export function useUploadVideo() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const setMetadata = useVideoStore((s) => s.setMetadata);
  const setFile = useVideoStore((s) => s.setFile);
  const resetProcessing = useProcessingStore((s) => s.reset);
  const resetBlur = useBlurStore((s) => s.reset);
  const addToast = useUIStore((s) => s.addToast);
  const { data: allowedExtensions = [] } = useAllowedExtensionsQuery();

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const validExtensions = allowedExtensions.length > 0
        ? allowedExtensions
        : ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
      const hasValidExt = validExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );
      if (!hasValidExt && !file.type.startsWith('video/')) {
        throw new Error(`Invalid file type. Please upload ${validExtensions.map((e) => e.replace('.', '').toUpperCase()).join(', ')}.`);
      }

      resetProcessing();
      resetBlur();
      clearFrameCache();
      setUploadProgress(0);

      return await api.uploadVideo(file, '', (pct) => setUploadProgress(pct));
    },
    onSuccess: (metadata, file) => {
      setMetadata(metadata);
      setFile(file);
      addToast('Video uploaded successfully', 'success');
    },
    onError: (err: any) => {
      const msg = err.code === 'ERR_NETWORK'
        ? 'Server is offline. Please start the backend.'
        : (err.response?.data?.detail || err.message || 'Failed to process video.');
      addToast(msg, 'error');
    }
  });

  return { execute: mutation.mutateAsync, isLoading: mutation.isPending, progress: uploadProgress };
}