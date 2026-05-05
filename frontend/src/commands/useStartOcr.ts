import { useCallback } from 'react';
import { api } from '../services/api';
import { useProcessingStore } from '../store/processingStore';
import { useUIStore } from '../store/uiStore';

export function useStartOcr() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const setActiveOcrJobId = useProcessingStore((s) => s.setActiveOcrJobId);
  const addLog = useProcessingStore((s) => s.addLog);
  const addToast = useUIStore((s) => s.addToast);

  const execute = useCallback(async (config: any) => {
    setProcessing(true);
    addLog('--- Starting Process ---');
    try {
      const { job_id } = await api.startProcessing(config);
      setActiveOcrJobId(job_id);
      return job_id;
    } catch (err: any) {
      setProcessing(false);
      const msg = err.response?.data?.detail || err.message || 'Failed to start OCR';
      addToast(msg, 'error');
      addLog(`Error: ${msg}`);
      throw err;
    }
  }, [setProcessing, setActiveOcrJobId, addLog, addToast]);

  return { execute };
}