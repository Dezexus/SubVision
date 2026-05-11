import { useCallback } from 'react';
import { api } from '../services/api';
import { useProcessingStore } from '../store/processingStore';

export function useStopBlurRender() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const addLog = useProcessingStore((s) => s.addLog);
  const activeBlurJobId = useProcessingStore((s) => s.activeBlurJobId);
  const setActiveBlurJobId = useProcessingStore((s) => s.setActiveBlurJobId);
  const setStoppedJobId = useProcessingStore((s) => s.setStoppedJobId);

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
}