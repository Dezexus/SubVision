/**
 * Hook to initiate the smart blur rendering process via API.
 */
import { useCallback } from 'react';
import { api } from '../../../services/api';
import { useTaskStore } from '../../../store/taskStore';

export const useStartBlurRender = () => {
  const setProcessing = useTaskStore((s) => s.setProcessing);
  const setActiveBlurJobId = useTaskStore((s) => s.setActiveBlurJobId);
  const addLog = useTaskStore((s) => s.addLog);
  const setError = useTaskStore((s) => s.setError);

  const execute = useCallback(async (payload: any) => {
    setProcessing(true);
    addLog('Initiating blur render...');
    setError(null);
    try {
      const response = await api.startBlur(payload);
      if (response.job_id) {
        setActiveBlurJobId(response.job_id);
      }
      return response;
    } catch (err: any) {
      setError(err.message || 'Failed to start blur');
      setProcessing(false);
      addLog(`Error: ${err.message}`);
      throw err;
    }
  }, [setProcessing, setActiveBlurJobId, addLog, setError]);

  return { execute };
};