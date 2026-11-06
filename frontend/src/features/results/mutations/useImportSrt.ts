import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { getApiErrorMessage } from '../../../shared/lib/errors';
import { useProcessingStore } from '../../../store/processingStore';
import { useUIStore } from '../../../store/uiStore';
import { translate } from '../../../i18n';

/**
 * Mutation hook for importing external SRT files.
 */
export function useImportSrt() {
  const setSubtitles = useProcessingStore((s) => s.setSubtitles);
  const addLog = useProcessingStore((s) => s.addLog);
  const addToast = useUIStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: async (file: File) => {
      addLog(`Importing ${file.name}...`);
      return await api.importSrt(file);
    },
    onSuccess: (subs) => {
      setSubtitles(subs);
      addLog(`Imported ${subs.length} subtitles.`);
      addToast(translate('toasts.importSuccess', { count: subs.length }), 'success');
    },
    onError: (err: unknown) => {
      const msg = getApiErrorMessage(err, translate('toasts.importFailed'));
      addToast(msg, 'error');
      addLog(`Error importing SRT: ${msg}`);
    }
  });

  return { execute: mutation.mutateAsync };
}