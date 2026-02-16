// A custom hook to manage WebSocket communication and update the global state.
import { useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import { useAppStore } from '../store/useAppStore';
import type { WebSocketMessage } from '../types';
import { API_BASE } from '../services/api';

// Dynamically construct the WebSocket URL from the base API URL
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
    shouldReconnect: () => true, // Always attempt to reconnect on disconnect
    reconnectInterval: 3000,
  });

  useEffect(() => {
    if (!lastJsonMessage) return;

    const msg = lastJsonMessage as WebSocketMessage;

    // Process incoming messages based on their type
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
        // This case might not be used frequently but is available for real-time AI edits
        updateSubtitle(msg.item);
        break;
      case 'finish':
        setProcessing(false);
        addLog(msg.success ? '--- Process Completed Successfully ---' : '--- Process Failed ---');
        break;
      default:
        console.warn('Unknown WebSocket message type:', msg);
    }
  }, [lastJsonMessage, addLog, updateProgress, addSubtitle, updateSubtitle, setProcessing]);
};
