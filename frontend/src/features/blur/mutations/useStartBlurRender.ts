import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { useProcessingStore } from '../../../store/processingStore';
import { useUIStore } from '../../../store/uiStore';
import type { RenderConfig } from '../../../types';

/**
 * Mutation hook for starting the smart blur rendering process.
 */
export function useStartBlurRender() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const setActiveBlurJobId = useProcessingStore((s) => s.setActiveBlurJobId);
  const addLog = useProcessingStore((s) => s.addLog);
  const addToast = useUIStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: async (config: RenderConfig) => {
      return await api.renderBlurVideo(config);
    },
    onMutate: () => {
      setProcessing(true);
      addLog('--- Starting Smart Render ---');
    },
    onSuccess: (data) => {
      setActiveBlurJobId(data.job_id);
    },
    onError: (err: any) => {
      setProcessing(false);
      const msg = err.response?.data?.detail || err.message || 'Failed to start render';
      addToast(msg, 'error');
      addLog(`Error: ${msg}`);
      addLog('Error: Render failed to start.');
    }
  });

  return { execute: mutation.mutateAsync };
}