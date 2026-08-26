import { useEffect, useCallback, useRef } from 'react';
import useWebSocket from 'react-use-websocket';
import axios from 'axios';
import { useProcessingStore } from '../store/processingStore';
import { useUIStore } from '../store/uiStore';
import { API_URL, getWsBase } from '../shared/api/config';
import type { SubtitleItem, WebSocketMessage } from '../types';

function activeJobIds(): string[] {
  const { activeOcrJobId, activeBlurJobId } = useProcessingStore.getState();
  return [activeOcrJobId, activeBlurJobId].filter((id): id is string => !!id);
}

function bindActiveJobId(jobId: string | null | undefined) {
  if (!jobId) return;
  const store = useProcessingStore.getState();
  if (jobId.startsWith('ocr_')) {
    if (store.activeOcrJobId !== jobId) store.setActiveOcrJobId(jobId);
    if (store.activeBlurJobId) store.setActiveBlurJobId(null);
  } else if (jobId.startsWith('blur_')) {
    if (store.activeBlurJobId !== jobId) store.setActiveBlurJobId(jobId);
    if (store.activeOcrJobId) store.setActiveOcrJobId(null);
  }
}

/** Deny-by-default: only accept events for our known active job ids. */
function isRelevantJobEvent(jobId: string | undefined, opts?: { allowUntagged?: boolean }): boolean {
  const { isProcessing, stoppedJobId } = useProcessingStore.getState();
  if (jobId && stoppedJobId && jobId === stoppedJobId) {
    return false;
  }
  if (!isProcessing) {
    return false;
  }
  const ids = activeJobIds();
  if (ids.length === 0) {
    // Enqueue in flight — never apply a stale finish/progress from a previous job.
    return false;
  }
  if (!jobId) {
    return opts?.allowUntagged === true;
  }
  return ids.includes(jobId);
}

async function ackTerminalState(clientId: string, jobId: string | undefined) {
  if (!jobId) return;
  try {
    await axios.post(`${API_URL}/session/ack`, { client_id: clientId, job_id: jobId });
  } catch (e) {
    console.warn('Failed to ack session state', e);
  }
}

function applyFinishState(
  data: Extract<WebSocketMessage, { type: 'finish' }>,
  deps: {
    setProcessing: (v: boolean) => void;
    setActiveOcrJobId: (v: string | null) => void;
    setActiveBlurJobId: (v: string | null) => void;
    updateProgress: (c: number, t: number, eta?: string) => void;
    setRenderedVideoUrl: (url: string | null) => void;
    setSubtitles: (subs: SubtitleItem[]) => void;
    addToast: (msg: string, type: 'success' | 'error' | 'info') => void;
    showToast: boolean;
    replaceSubtitles: boolean;
  }
) {
  const {
    setProcessing, setActiveOcrJobId, setActiveBlurJobId,
    updateProgress, setRenderedVideoUrl, setSubtitles, addToast, showToast, replaceSubtitles,
  } = deps;

  setProcessing(false);
  setActiveOcrJobId(null);
  setActiveBlurJobId(null);

  if (data.success) {
    const isOcrJob = !data.job_id || data.job_id.startsWith('ocr_');
    if (isOcrJob && replaceSubtitles && data.subtitles?.length) {
      setSubtitles(data.subtitles);
    }
    const { current, total } = useProcessingStore.getState().progress;
    const done = Math.max(current, total, 1);
    updateProgress(done, done, '00:00');
    const isBlurJob = !data.job_id || data.job_id.startsWith('blur_');
    if (isBlurJob && data.download_url) {
      setRenderedVideoUrl(data.download_url);
      if (showToast) addToast('Render completed successfully', 'success');
    } else if (showToast) {
      addToast('Processing completed successfully', 'success');
    }
  } else if (showToast) {
    addToast(data.error || 'Task failed', 'error');
  }
}

/**
 * Soft-recover artifacts after a missed finish without flipping UI into "Completed".
 * Used on cold idle refresh — then ACK so the terminal state is not replayed again.
 */
function softRecoverFinish(data: Extract<WebSocketMessage, { type: 'finish' }>) {
  const store = useProcessingStore.getState();
  if (!data.success) return;
  const isOcrJob = !data.job_id || data.job_id.startsWith('ocr_');
  if (isOcrJob && data.subtitles?.length && store.subtitles.length === 0) {
    store.setSubtitles(data.subtitles);
  }
  const isBlurJob = !data.job_id || data.job_id.startsWith('blur_');
  if (isBlurJob && data.download_url && !store.renderedVideoUrl) {
    store.setRenderedVideoUrl(data.download_url);
  }
}

/**
 * Hook to manage WebSocket connection and synchronize processing state.
 */
export const useProcessingSocket = (clientId: string | null) => {
  const addLog = useProcessingStore(s => s.addLog);
  const updateProgress = useProcessingStore(s => s.updateProgress);
  const addSubtitle = useProcessingStore(s => s.addSubtitle);
  const updateSubtitle = useProcessingStore(s => s.updateSubtitle);
  const setSubtitles = useProcessingStore(s => s.setSubtitles);
  const setProcessing = useProcessingStore(s => s.setProcessing);
  const setActiveOcrJobId = useProcessingStore(s => s.setActiveOcrJobId);
  const setActiveBlurJobId = useProcessingStore(s => s.setActiveBlurJobId);
  const setRenderedVideoUrl = useProcessingStore(s => s.setRenderedVideoUrl);
  const addToast = useUIStore(s => s.addToast);
  const lastProgressAt = useRef(Date.now());

  const wsBase = getWsBase();

  const syncFromServer = useCallback(async (opts?: { showToast?: boolean }) => {
    if (!clientId) return;
    const showToast = opts?.showToast ?? false;
    try {
      const { data: res } = await axios.get(`${API_URL}/session/status/${clientId}`);
      const state = res.last_state as WebSocketMessage | null | undefined;
      const local = useProcessingStore.getState();

      // Active job: bind job id immediately so live WS events are accepted.
      if (res.has_active_job && res.job_id) {
        bindActiveJobId(res.job_id);
        if (!local.isProcessing) setProcessing(true);
        if (
          state?.type === 'progress'
          && (!state.job_id || state.job_id === res.job_id)
        ) {
          updateProgress(state.current, state.total, state.eta);
          lastProgressAt.current = Date.now();
        }
        // If job_status already terminal while active_job briefly races, fall through carefully.
        if (state?.type === 'finish' && (!state.job_id || state.job_id === res.job_id)) {
          applyFinishState(state, {
            setProcessing, setActiveOcrJobId, setActiveBlurJobId,
            updateProgress, setRenderedVideoUrl, setSubtitles, addToast,
            showToast,
            replaceSubtitles: true,
          });
          await ackTerminalState(clientId, state.job_id || res.job_id);
        }
        return;
      }

      // Idle + terminal snapshot.
      if (state?.type === 'finish') {
        if (local.isProcessing) {
          // Missed WS finish while UI still thinks a job is running.
          applyFinishState(state, {
            setProcessing, setActiveOcrJobId, setActiveBlurJobId,
            updateProgress, setRenderedVideoUrl, setSubtitles, addToast,
            showToast,
            replaceSubtitles: true,
          });
          await ackTerminalState(clientId, state.job_id);
          return;
        }

        // Cold idle refresh: recover artifacts quietly, never show fake Completed.
        softRecoverFinish(state);
        await ackTerminalState(clientId, state.job_id);
        return;
      }

      // No active job — clear stuck UI (missed finish / zombie processing flag).
      if (!res.has_active_job && local.isProcessing) {
        setProcessing(false);
        setActiveOcrJobId(null);
        setActiveBlurJobId(null);
        const { current, total } = local.progress;
        if (total > 0) updateProgress(Math.max(current, total), Math.max(current, total), '00:00');
      }
    } catch (e) {
      console.error('Failed to restore processing state', e);
    }
  }, [
    clientId, updateProgress, setProcessing, setActiveOcrJobId, setActiveBlurJobId,
    setRenderedVideoUrl, setSubtitles, addToast,
  ]);

  const { lastJsonMessage, sendJsonMessage, readyState } = useWebSocket(
    clientId ? `${wsBase}/ws/${clientId}` : null,
    {
      shouldReconnect: () => true,
      reconnectAttempts: 50,
      reconnectInterval: 2000,
      onOpen: () => {
        void syncFromServer({ showToast: true });
      },
    }
  );

  useEffect(() => {
    if (!clientId || readyState !== 1) return;
    const id = window.setInterval(() => {
      try {
        sendJsonMessage({ type: 'ping' });
      } catch {
        /* ignore */
      }
    }, 20000);
    return () => window.clearInterval(id);
  }, [clientId, readyState, sendJsonMessage]);

  useEffect(() => {
    if (!clientId) return;
    const id = window.setInterval(() => {
      const { isProcessing, progress } = useProcessingStore.getState();
      if (!isProcessing) return;
      const atEnd = progress.total > 0 && progress.current >= progress.total;
      const stalled = Date.now() - lastProgressAt.current > 8000;
      if (atEnd || stalled) {
        void syncFromServer({ showToast: true });
      }
    }, 5000);
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

  useEffect(() => {
    if (!lastJsonMessage) return;
    const data = lastJsonMessage as WebSocketMessage;

    switch (data.type) {
      case 'log':
        if (!isRelevantJobEvent(data.job_id, { allowUntagged: true })) break;
        addLog(data.message);
        break;
      case 'progress':
        if (!isRelevantJobEvent(data.job_id)) break;
        lastProgressAt.current = Date.now();
        updateProgress(data.current, data.total, data.eta);
        break;
      case 'subtitle_new':
        if (!isRelevantJobEvent(data.job_id)) break;
        addSubtitle(data.item);
        break;
      case 'subtitle_update':
        if (!isRelevantJobEvent(data.job_id)) break;
        updateSubtitle(data.item);
        break;
      case 'subtitles_replace':
        if (!isRelevantJobEvent(data.job_id)) break;
        setSubtitles(data.items);
        break;
      case 'finish':
        if (!isRelevantJobEvent(data.job_id)) break;
        applyFinishState(data, {
          setProcessing, setActiveOcrJobId, setActiveBlurJobId,
          updateProgress, setRenderedVideoUrl, setSubtitles, addToast,
          showToast: true,
          replaceSubtitles: true,
        });
        if (clientId) void ackTerminalState(clientId, data.job_id);
        break;
      case 'pong':
        break;
    }
  }, [
    lastJsonMessage, addLog, updateProgress, addSubtitle, updateSubtitle, setSubtitles,
    setProcessing, setActiveOcrJobId, setActiveBlurJobId,
    setRenderedVideoUrl, addToast, clientId,
  ]);
};
