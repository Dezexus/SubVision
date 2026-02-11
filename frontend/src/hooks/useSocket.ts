import { useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import { useAppStore } from '../store/useAppStore';
import type { WebSocketMessage } from '../types';
import { API_BASE } from '../services/api';

// FIX: Construct WS URL dynamically based on API_BASE
const getSocketUrl = () => {
  const url = new URL(API_BASE);
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${url.host}/ws`;
};

const SOCKET_URL = getSocketUrl();

export const useSocket = () => {
  const {
    clientId,
    addLog,
    updateProgress,
    addSubtitle,
    updateSubtitle,
    setProcessing
  } = useAppStore();

  const { lastJsonMessage } = useWebSocket(`${SOCKET_URL}/${clientId}`, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
  });

  useEffect(() => {
    if (!lastJsonMessage) return;

    const msg = lastJsonMessage as WebSocketMessage;

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
        addLog(msg.success ? '--- Process Completed Successfully ---' : '--- Process Failed ---');
        break;
      default:
        console.warn('Unknown WS message:', msg);
    }
  }, [lastJsonMessage, addLog, updateProgress, addSubtitle, updateSubtitle, setProcessing]);
};
