import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useMutation } from '@tanstack/react-query';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { useBlurStore } from '../../../store/blurStore';
import { api } from '../../../shared/api';
import { getApiErrorMessage } from '../../../shared/lib/errors';
import { useUIStore } from '../../../store/uiStore';
import { translate } from '../../../i18n';
import { clearFrameCache } from '../hooks/useVideoFrame';
import { formatExtensions, useVideoExtensions } from '../queries/useAllowedExtensionsQuery';

/** Thrown when the user cancels; callers should not show it as an error. */
export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelledError';
  }
}

/**
 * Mutation hook for uploading a video file and initializing the project state.
 */
export function useUploadVideo() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const setMetadata = useVideoStore((s) => s.setMetadata);
  const setFile = useVideoStore((s) => s.setFile);
  const resetProcessing = useProcessingStore((s) => s.reset);
  const resetBlur = useBlurStore((s) => s.reset);
  const addToast = useUIStore((s) => s.addToast);
  const validExtensions = useVideoExtensions();

  useEffect(() => () => abortRef.current?.abort(), []);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      const hasValidExt = validExtensions.some((ext) =>
        file.name.toLowerCase().endsWith(ext)
      );
      if (!hasValidExt && !file.type.startsWith('video/')) {
        throw new Error(translate('welcome.invalidFileType', { exts: formatExtensions(validExtensions) }));
      }

      resetProcessing();
      resetBlur();
      // Regions and track names belong to the previous video.
      useVideoStore.getState().resetTracks();
      clearFrameCache();
      setUploadProgress(0);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        return await api.uploadVideo(file, {
          onProgress: setUploadProgress,
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted || axios.isCancel(err)) throw new UploadCancelledError();
        throw err;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    onSuccess: (metadata, file) => {
      setMetadata(metadata);
      setFile(file);
      addToast(translate('toasts.uploadSuccess'), 'success');
    },
    onError: (err: unknown) => {
      if (err instanceof UploadCancelledError) return;
      const msg = getApiErrorMessage(
        err,
        translate('toasts.uploadFailed'),
        translate('toasts.serverOffline'),
      );
      addToast(msg, 'error');
    }
  });

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return {
    execute: mutation.mutateAsync,
    cancel,
    isLoading: mutation.isPending,
    progress: uploadProgress,
  };
}
