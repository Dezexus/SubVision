import { useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import { useAppStore } from '../store/useAppStore';
import type { WebSocketMessage } from '../types';

const SOCKET_URL = 'ws://localhost:7860/ws'; // Или из env

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
    shouldReconnect: () => true, // Авто-реконнект
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
