import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { useProcessingStore } from '../../../store/processingStore';

/**
 * Mutation hook for stopping an active blur render process.
 */
export function useStopBlurRender() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const addLog = useProcessingStore((s) => s.addLog);
  const activeBlurJobId = useProcessingStore((s) => s.activeBlurJobId);
  const setActiveBlurJobId = useProcessingStore((s) => s.setActiveBlurJobId);
  const setStoppedJobId = useProcessingStore((s) => s.setStoppedJobId);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!activeBlurJobId) return;
      setStoppedJobId(activeBlurJobId);
      setProcessing(false);
      await api.stopProcessing(activeBlurJobId);
    },
    onSuccess: () => {
      addLog('--- Render stopped by user ---');
      setActiveBlurJobId(null);
    },
    onError: (e) => {
      console.error('Failed to send stop signal', e);
      setActiveBlurJobId(null);
    }
  });

  return { execute: mutation.mutateAsync };
}