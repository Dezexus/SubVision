import { useEffect, useCallback, useRef } from 'react';
import useWebSocket from 'react-use-websocket';
import { api, getWsBase } from '../shared/api';
import { useProcessingStore } from '../store/processingStore';
import type { WebSocketMessage } from '../types';
import { applySessionStatus, handleSocketMessage, type EventOutcome } from './processingEvents';

const PING_INTERVAL_MS = 20_000;
const WATCHDOG_INTERVAL_MS = 5_000;
const STALL_THRESHOLD_MS = 8_000;

async function ackTerminalState(clientId: string, jobId: string | undefined) {
  if (!jobId) return;
  try {
    await api.ackSessionState(clientId, jobId);
  } catch (e) {
    console.warn('Failed to ack session state', e);
  }
}

export const useProcessingSocket = (clientId: string | null) => {
  const lastProgressAt = useRef(0);

  const applyOutcome = useCallback((outcome: EventOutcome) => {
    if (outcome.progressed) lastProgressAt.current = Date.now();
    if (clientId && outcome.ackJobId) void ackTerminalState(clientId, outcome.ackJobId);
  }, [clientId]);

  const syncFromServer = useCallback(async (opts?: { showToast?: boolean }) => {
    if (!clientId) return;
    try {
      const res = await api.getSessionStatus(clientId);
      applyOutcome(applySessionStatus(res, { showToast: opts?.showToast ?? false }));
    } catch (e) {
      console.error('Failed to restore processing state', e);
    }
  }, [clientId, applyOutcome]);

  // Handle every message in onMessage: lastJsonMessage is React state, so a
  // burst of events between two renders would collapse into the last one.
  const onMessage = useCallback((event: MessageEvent) => {
    let data: WebSocketMessage;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    applyOutcome(handleSocketMessage(data));
  }, [applyOutcome]);

  const { sendJsonMessage, readyState } = useWebSocket(
    clientId ? `${getWsBase()}/ws/${clientId}` : null,
    {
      shouldReconnect: () => true,
      reconnectAttempts: 50,
      reconnectInterval: 2000,
      onOpen: () => {
        void syncFromServer({ showToast: true });
      },
      onMessage,
      // Messages are fully handled in onMessage; skip lastMessage re-renders.
      filter: () => false,
    },
  );

  useEffect(() => {
    if (!clientId || readyState !== 1) return;
    const id = window.setInterval(() => {
      try {
        sendJsonMessage({ type: 'ping' });
      } catch {
        /* ignore */
      }
    }, PING_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [clientId, readyState, sendJsonMessage]);

  useEffect(() => {
    if (!clientId) return;
    const id = window.setInterval(() => {
      const { isProcessing, progress } = useProcessingStore.getState();
      if (!isProcessing) return;
      const atEnd = progress.total > 0 && progress.current >= progress.total;
      const stalled = Date.now() - lastProgressAt.current > STALL_THRESHOLD_MS;
      if (atEnd || stalled) {
        void syncFromServer({ showToast: true });
      }
    }, WATCHDOG_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [clientId, syncFromServer]);

  useEffect(() => {
    if (!clientId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncFromServer({ showToast: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [clientId, syncFromServer]);
};
