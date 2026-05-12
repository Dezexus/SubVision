import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { useProcessingStore } from '../../../store/processingStore';

/**
 * Mutation hook for cancelling an active OCR process.
 */
export function useStopOcr() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const addLog = useProcessingStore((s) => s.addLog);
  const activeOcrJobId = useProcessingStore((s) => s.activeOcrJobId);
  const setActiveOcrJobId = useProcessingStore((s) => s.setActiveOcrJobId);
  const setStoppedJobId = useProcessingStore((s) => s.setStoppedJobId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeOcrJobId) return;
      setStoppedJobId(activeOcrJobId);
      setProcessing(false);
      await api.stopProcessing(activeOcrJobId);
    },
    onSuccess: () => {
      addLog('--- Processing stopped by user ---');
      setActiveOcrJobId(null);
    },
    onError: (e) => {
      console.error('Failed to send stop signal', e);
      setActiveOcrJobId(null);
    }
  });

  return { execute: mutation.mutateAsync };
}