/**
 * Hook to initiate the OCR processing job.
 */
import { useCallback } from 'react';
import { api } from '../../../services/api';
import { useTaskStore } from '../../../store/taskStore';

export const useStartOcr = () => {
  const setProcessing = useTaskStore((s) => s.setProcessing);
  const setActiveOcrJobId = useTaskStore((s) => s.setActiveOcrJobId);
  const addLog = useTaskStore((s) => s.addLog);
  const setError = useTaskStore((s) => s.setError);

  const execute = useCallback(async (payload: any) => {
    setProcessing(true);
    addLog('Starting OCR process...');
    setError(null);
    try {
      const response = await api.startOcr(payload);
      if (response.job_id) {
        setActiveOcrJobId(response.job_id);
      }
      return response;
    } catch (err: any) {
      setError(err.message || 'Failed to start OCR');
      setProcessing(false);
      addLog(`Error: ${err.message}`);
      throw err;
    }
  }, [setProcessing, setActiveOcrJobId, addLog, setError]);

  return { execute };
};