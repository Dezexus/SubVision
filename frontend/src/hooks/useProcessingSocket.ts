import { useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import { useProcessingStore } from '../store/processingStore';
import { API_BASE } from '../services/api';

const getSocketUrl = () => {
  const url = new URL(API_BASE);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/ws`;
};

const SOCKET_URL = getSocketUrl();

export const useProcessingSocket = (clientId: string | null) => {
  const activeOcrJobId = useProcessingStore((s) => s.activeOcrJobId);
  const activeBlurJobId = useProcessingStore((s) => s.activeBlurJobId);
  const addLog = useProcessingStore((s) => s.addLog);
  const updateProgress = useProcessingStore((s) => s.updateProgress);
  const addSubtitle = useProcessingStore((s) => s.addSubtitle);
  const updateSubtitle = useProcessingStore((s) => s.updateSubtitle);
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const setRenderedVideoUrl = useProcessingStore((s) => s.setRenderedVideoUrl);

  const { lastJsonMessage } = useWebSocket(
    clientId ? `${SOCKET_URL}/${clientId}` : null,
    {
      shouldReconnect: () => true,
      reconnectInterval: 3000,
    }
  );

  useEffect(() => {
    if (!lastJsonMessage) return;

    const msg = lastJsonMessage as any;
    if (msg.type === 'pong') return;

    if (msg.job_id) {
      const relevantJobs = [activeOcrJobId, activeBlurJobId].filter(Boolean);
      if (relevantJobs.length > 0 && !relevantJobs.includes(msg.job_id)) {
        return;
      }
    }

    const isProcessing = useProcessingStore.getState().isProcessing;
    const stoppedJobId = useProcessingStore.getState().stoppedJobId;

    if (msg.type !== 'finish') {
      if (!isProcessing && stoppedJobId) {
        return;
      }
    }

    switch (msg.type) {
      case 'log':
        addLog(msg.message);
        break;
      case 'progress':
        updateProgress(msg.current, msg.total, msg.eta);
        break;
      case 'subtitle_new':
        addSubtitle(msg.item);
        break;
      case 'subtitle_update':
        updateSubtitle(msg.item);
        break;
      case 'finish':
        setProcessing(false);
        if (msg.success) {
          addLog('--- Process Completed Successfully ---');
          if (msg.download_url) {
            const uniqueUrl = `${msg.download_url}?t=${Date.now()}`;
            setRenderedVideoUrl(uniqueUrl);
          }
        } else {
          addLog('--- Process Failed ---');
          if (msg.error) addLog(`Error details: ${msg.error}`);
        }
        break;
    }
  }, [lastJsonMessage, activeOcrJobId, activeBlurJobId, addLog, updateProgress, addSubtitle, updateSubtitle, setProcessing, setRenderedVideoUrl]);
};