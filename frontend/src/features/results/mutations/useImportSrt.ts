import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { useProcessingStore } from '../../../store/processingStore';
import { useUIStore } from '../../../store/uiStore';

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
      addToast(`Imported ${subs.length} subtitles`, 'success');
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.message || 'Import failed';
      addToast(msg, 'error');
      addLog(`Error importing SRT: ${msg}`);
    }
  });

  return { execute: mutation.mutateAsync };
}