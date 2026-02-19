/**
 * WebSocket hook for real-time bidirectional communication.
 */
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
  const {
    clientId,
    addLog,
    updateProgress,
    addSubtitle,
    updateSubtitle,
    setProcessing,
    setRenderedVideoUrl
  } = useAppStore();

  const { lastJsonMessage, sendJsonMessage } = useWebSocket(`${SOCKET_URL}/${clientId}`, {
    shouldReconnect: () => true,
    reconnectInterval: 3000,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      sendJsonMessage({ type: 'ping' });
    }, 30000);

    return () => clearInterval(interval);
  }, [sendJsonMessage]);

  useEffect(() => {
    if (!lastJsonMessage) return;

    const msg = lastJsonMessage as WebSocketMessage | { type: 'pong' };

    if (msg.type === 'pong') return;

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
