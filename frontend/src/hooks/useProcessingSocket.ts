import { useEffect, useState } from 'react';
import useWebSocket from 'react-use-websocket';
import { useTaskStore } from '../store/taskStore';
import { useSubtitleStore } from '../store/subtitleStore';
import { API_BASE } from '../services/api';
import { getClientId } from '../shared/lib';

const getSocketUrl = () => {
  const url = new URL(API_BASE);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/ws`;
};

const SOCKET_URL = getSocketUrl();

/**
 * WebSocket hook for listening to backend processing events and updating task/subtitle stores.
 */
export const useProcessingSocket = (providedClientId?: string | null) => {
  const [clientId] = useState(() => providedClientId || getClientId());
  
  const activeOcrJobId = useTaskStore((s) => s.activeOcrJobId);
  const activeBlurJobId = useTaskStore((s) => s.activeBlurJobId);
  const addLog = useTaskStore((s) => s.addLog);
  const updateProgress = useTaskStore((s) => s.updateProgress);
  const setProcessing = useTaskStore((s) => s.setProcessing);
  const setRenderedVideoUrl = useTaskStore((s) => s.setRenderedVideoUrl);
  
  const addSubtitle = useSubtitleStore((s) => s.addSubtitle);
  const updateSubtitle = useSubtitleStore((s) => s.updateSubtitle);

  const { lastJsonMessage } = useWebSocket(
    clientId ? `${SOCKET_URL}/${clientId}` : null,
    {
      shouldReconnect: (closeEvent) => {
        if (closeEvent.code === 4001) {
          window.location.reload();
          return false;
        }
        return true;
      },
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

    const isProcessing = useTaskStore.getState().isProcessing;
    const stoppedJobId = useTaskStore.getState().stoppedJobId;

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
  }, [
    lastJsonMessage, activeOcrJobId, activeBlurJobId, addLog, 
    updateProgress, addSubtitle, updateSubtitle, setProcessing, setRenderedVideoUrl
  ]);
};