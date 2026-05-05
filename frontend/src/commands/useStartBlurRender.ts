import { useCallback } from 'react';
import { api } from '../services/api';
import { useProcessingStore } from '../store/processingStore';
import { useUIStore } from '../store/uiStore';

export function useStartBlurRender() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const setActiveBlurJobId = useProcessingStore((s) => s.setActiveBlurJobId);
  const addLog = useProcessingStore((s) => s.addLog);
  const addToast = useUIStore((s) => s.addToast);

  const execute = useCallback(async (config: any) => {
    setProcessing(true);
    addLog('--- Starting Smart Render ---');
    try {
      const { job_id } = await api.renderBlurVideo(config);
      setActiveBlurJobId(job_id);
      return job_id;
    } catch (err: any) {
      setProcessing(false);
      const msg = err.response?.data?.detail || err.message || 'Failed to start render';
      addToast(msg, 'error');
      addLog(`Error: ${msg}`);
      throw err;
    }
  }, [setProcessing, setActiveBlurJobId, addLog, addToast]);

  return { execute };
}