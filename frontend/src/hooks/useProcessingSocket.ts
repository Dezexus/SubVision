import { useEffect } from 'react';
import useWebSocket from 'react-use-websocket';
import axios from 'axios';
import { useProcessingStore } from '../store/processingStore';
import { useUIStore } from '../store/uiStore';

const API_BASE = import.meta.env.VITE_API_URL || '';
const WS_URL = API_BASE 
  ? API_BASE.replace(/^http(s?):\/\//, 'ws$1://') 
  : `ws://${window.location.host}`;

/**
 * Hook to manage WebSocket connection and synchronize processing state.
 */
export const useProcessingSocket = (clientId: string | null) => {
  const addLog = useProcessingStore(s => s.addLog);
  const updateProgress = useProcessingStore(s => s.updateProgress);
  const addSubtitle = useProcessingStore(s => s.addSubtitle);
  const setProcessing = useProcessingStore(s => s.setProcessing);
  const setActiveOcrJobId = useProcessingStore(s => s.setActiveOcrJobId);
  const setActiveBlurJobId = useProcessingStore(s => s.setActiveBlurJobId);
  const setRenderedVideoUrl = useProcessingStore(s => s.setRenderedVideoUrl);
  const addToast = useUIStore(s => s.addToast);

  const { lastJsonMessage } = useWebSocket(
    clientId ? `${WS_URL}/ws/${clientId}` : null,
    {
      shouldReconnect: () => true,
      reconnectAttempts: 10,
      reconnectInterval: 2000,
      onOpen: async () => {
        if (!clientId) return;
        try {
          const { data: res } = await axios.get(`${API_BASE}/api/session/status/${clientId}`);
          if (res.has_active_job && res.last_state) {
            const state = res.last_state;
            if (state.type === 'progress') {
              updateProgress(state.current, state.total, state.eta);
            }
          }
        } catch (e) {
          console.error("Failed to restore processing state", e);
        }
      }
    }
  );

  useEffect(() => {
    if (!lastJsonMessage) return;
    const data = lastJsonMessage as any;
    
    switch (data.type) {
      case 'log':
        addLog(data.message);
        break;
      case 'progress':
        updateProgress(data.current, data.total, data.eta);
        break;
      case 'subtitle_new':
        addSubtitle(data.item);
        break;
      case 'finish':
        setProcessing(false);
        setActiveOcrJobId(null);
        setActiveBlurJobId(null);
        if (data.success) {
          if (data.download_url) {
            setRenderedVideoUrl(data.download_url);
            addToast('Render completed successfully', 'success');
          } else {
            addToast('Processing completed successfully', 'success');
          }
        } else {
          addToast(data.error || 'Task failed', 'error');
        }
        break;
    }
  }, [
    lastJsonMessage, addLog, updateProgress, addSubtitle, 
    setProcessing, setActiveOcrJobId, setActiveBlurJobId, 
    setRenderedVideoUrl, addToast
  ]);
};