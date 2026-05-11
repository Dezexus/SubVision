/**
 * Hook to stop the active blur rendering process.
 */
import { useCallback } from 'react';
import { api } from '../../../services/api';
import { useTaskStore } from '../../../store/taskStore';

export const useStopBlurRender = () => {
  const setProcessing = useTaskStore((s) => s.setProcessing);
  const addLog = useTaskStore((s) => s.addLog);
  const activeBlurJobId = useTaskStore((s) => s.activeBlurJobId);
  const setActiveBlurJobId = useTaskStore((s) => s.setActiveBlurJobId);
  const setStoppedJobId = useTaskStore((s) => s.setStoppedJobId);

  const execute = useCallback(async () => {
    if (!activeBlurJobId) return;
    try {
      setStoppedJobId(activeBlurJobId);
      setProcessing(false);
      await api.stopProcessing(activeBlurJobId);
      addLog('--- Render stopped by user ---');
    } catch (e) {
      console.error('Failed to send stop signal', e);
    } finally {
      setActiveBlurJobId(null);
    }
  }, [activeBlurJobId, setActiveBlurJobId, setProcessing, setStoppedJobId, addLog]);

  return { execute };
};