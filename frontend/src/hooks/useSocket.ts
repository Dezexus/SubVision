import { useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import { useAppStore } from '../store/useAppStore';
import type { WebSocketMessage } from '../types';
import { API_BASE } from '../services/api';

const getSocketUrl = () => {
  const url = new URL(API_BASE);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/ws`;
};

const SOCKET_URL = getSocketUrl();

export const useSocket = () => {
  const clientId = useAppStore((state) => state.clientId);
  const addLog = useAppStore((state) => state.addLog);
  const updateProgress = useAppStore((state) => state.updateProgress);
  const addSubtitle = useAppStore((state) => state.addSubtitle);
  const updateSubtitle = useAppStore((state) => state.updateSubtitle);
  const setProcessing = useAppStore((state) => state.setProcessing);
  const setRenderedVideoUrl = useAppStore((state) => state.setRenderedVideoUrl);
  const stoppedJobId = useAppStore((state) => state.stoppedJobId);

  const { lastJsonMessage } = useWebSocket(
    clientId ? `${SOCKET_URL}/${clientId}` : null,
    {
      shouldReconnect: () => true,
      reconnectInterval: 3000,
    }
  );

  useEffect(() => {
    if (!lastJsonMessage) return;

    const msg = lastJsonMessage as WebSocketMessage | { type: 'pong' };
    if (msg.type === 'pong') return;

    const currentProcessing = useAppStore.getState().isProcessing;
    const currentStopped = useAppStore.getState().stoppedJobId;

    if (!currentProcessing && currentStopped) {
      return;
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
          if (msg.error) {
            addLog(`Error details: ${msg.error}`);
          }
        }
        break;
      default:
        console.warn('Unknown WebSocket message type:', msg);
    }
  }, [lastJsonMessage, addLog, updateProgress, addSubtitle, updateSubtitle, setProcessing, setRenderedVideoUrl]);
};