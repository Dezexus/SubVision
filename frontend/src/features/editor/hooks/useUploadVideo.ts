/**
 * Hook to handle video file selection, uploading to the backend, and updating the application state.
 */
import { useCallback } from 'react';
import { api } from '../../../services/api';
import { useVideoStore } from '../../../store/videoStore';
import { useTaskStore } from '../../../store/taskStore';
import { useSubtitleStore } from '../../../store/subtitleStore';

export const useUploadVideo = () => {
  const clientId = useVideoStore((s) => s.clientId);
  const setFile = useVideoStore((s) => s.setFile);
  const setMetadata = useVideoStore((s) => s.setMetadata);
  
  const setProcessing = useTaskStore((s) => s.setProcessing);
  const setError = useTaskStore((s) => s.setError);
  
  const resetSubtitles = useSubtitleStore((s) => s.reset);

  const execute = useCallback(async (file: File) => {
    if (!clientId) return;
    
    setProcessing(true);
    setError(null);
    resetSubtitles();
    
    try {
      const response = await api.uploadVideo(file, clientId);
      setFile(file);
      setMetadata(response.metadata);
      return response;
    } catch (err: any) {
      setError(err.message || 'Failed to upload video');
      throw err;
    } finally {
      setProcessing(false);
    }
  }, [clientId, setFile, setMetadata, setProcessing, setError, resetSubtitles]);

  return { execute };
};