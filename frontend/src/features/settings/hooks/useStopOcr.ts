/**
 * Hook to stop the active OCR processing job.
 */
import { useCallback } from 'react';
import { api } from '../../../services/api';
import { useTaskStore } from '../../../store/taskStore';

export const useStopOcr = () => {
  const activeOcrJobId = useTaskStore((s) => s.activeOcrJobId);
  const setStoppedJobId = useTaskStore((s) => s.setStoppedJobId);
  const addLog = useTaskStore((s) => s.addLog);

  const execute = useCallback(async () => {
    if (!activeOcrJobId) return;
    addLog('Requesting OCR cancellation...');
    try {
      await api.stopJob(activeOcrJobId);
      setStoppedJobId(activeOcrJobId);
    } catch (err: any) {
      addLog(`Failed to stop job: ${err.message}`);
    }
  }, [activeOcrJobId, setStoppedJobId, addLog]);

  return { execute };
};