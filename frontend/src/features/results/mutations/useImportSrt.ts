import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { getApiErrorMessage } from '../../../shared/lib/errors';
import { useProcessingStore } from '../../../store/processingStore';
import { useUIStore } from '../../../store/uiStore';
import { useVideoStore } from '../../../store/videoStore';
import { translate } from '../../../i18n';

/**
 * Mutation hook for importing external SRT files.
 */
export function useImportSrt() {
  const importSubtitles = useProcessingStore((s) => s.importSubtitles);
  const addToast = useUIStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: (file: File) => api.importSrt(file),
    onSuccess: (subs) => {
      // Import into the selected track, replacing only that track's cues.
      importSubtitles(subs, useVideoStore.getState().activeTrack);
      addToast(translate('toasts.importSuccess', { count: subs.length }), 'success');
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, translate('toasts.importFailed'));
      addToast(msg, 'error');
    }
  });

  return { execute: mutation.mutateAsync };
}