import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { useProcessingStore } from '../../../store/processingStore';
import { useUIStore } from '../../../store/uiStore';
import type { ProcessConfig } from '../../../types';

/**
 * Mutation hook for initiating the OCR extraction process.
 */
export function useStartOcr() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const setActiveOcrJobId = useProcessingStore((s) => s.setActiveOcrJobId);
  const setActiveBlurJobId = useProcessingStore((s) => s.setActiveBlurJobId);
  const addLog = useProcessingStore((s) => s.addLog);
  const addToast = useUIStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: async (config: ProcessConfig) => {
      return await api.startProcessing(config);
    },
    onMutate: () => {
      setProcessing(true);
      setActiveBlurJobId(null);
      addLog('--- Starting Process ---');
    },
    onSuccess: (data) => {
      setActiveOcrJobId(data.job_id);
    },
    onError: (err: any) => {
      setProcessing(false);
      setActiveOcrJobId(null);
      const msg = err.response?.data?.detail || err.message || 'Failed to start OCR';
      addToast(msg, 'error');
      addLog(`Error: ${msg}`);
    }
  });

  return { execute: mutation.mutateAsync };
}