import { useCallback } from 'react';
import { api } from '../services/api';
import { useProcessingStore } from '../store/processingStore';

export function useStopOcr() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const addLog = useProcessingStore((s) => s.addLog);
  const activeOcrJobId = useProcessingStore((s) => s.activeOcrJobId);
  const setActiveOcrJobId = useProcessingStore((s) => s.setActiveOcrJobId);
  const setStoppedJobId = useProcessingStore((s) => s.setStoppedJobId);

  const execute = useCallback(async () => {
    if (!activeOcrJobId) return;
    try {
      setStoppedJobId(activeOcrJobId);
      setProcessing(false);
      await api.stopProcessing(activeOcrJobId);
      addLog('--- Processing stopped by user ---');
    } catch (e) {
      console.error('Failed to send stop signal', e);
    } finally {
      setActiveOcrJobId(null);
    }
  }, [activeOcrJobId, setActiveOcrJobId, setProcessing, setStoppedJobId, addLog]);

  return { execute };
}