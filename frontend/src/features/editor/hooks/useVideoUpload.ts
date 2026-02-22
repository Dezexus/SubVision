/**
 * Hook to manage video file upload logic, drag-and-drop state, and error handling.
 */
import { useState, useCallback } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';

export const useVideoUpload = () => {
  const { setFile, setMetadata, addLog, clientId, logs } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isConverting = logs.includes('CONVERTING_CODEC');

  const handleFile = useCallback(async (selectedFile: File) => {
    setErrorMsg(null);
    const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
    const hasValidExt = validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));
    const isVideoType = selectedFile.type.startsWith('video/');

    if (!isVideoType && !hasValidExt) {
      setErrorMsg('Invalid file type. Please upload MP4, MKV, AVI, MOV or WEBM.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    addLog(`Uploading: ${selectedFile.name}...`);

    try {
      const metadata = await api.uploadVideo(selectedFile, clientId, (pct) => setUploadProgress(pct));
      setMetadata(metadata);
      setFile(selectedFile);
    } catch (error: any) {
      console.error(error);
      const msg = error.code === "ERR_NETWORK"
        ? "Server is offline. Please start the backend."
        : (error.response?.data?.detail || 'Failed to process video.');

      setErrorMsg(msg);
      addLog(`Error: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  }, [setFile, setMetadata, addLog, clientId]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  return {
    isDragging,
    isUploading,
    uploadProgress,
    errorMsg,
    isConverting,
    dragHandlers: {
      onDrop,
      onDragOver,
      onDragLeave,
    },
    onFileInputChange
  };
};
