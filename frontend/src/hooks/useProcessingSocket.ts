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

/** Ignore WS/status events that belong to another job (or arrive before our job_id is set). */
function isRelevantJobEvent(jobId: string | undefined, opts?: { allowUntagged?: boolean }): boolean {
  const { isProcessing } = useProcessingStore.getState();
  if (!isProcessing) {
    return true;
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
  }
) {
  const {
    setProcessing, setActiveOcrJobId, setActiveBlurJobId,
    updateProgress, setRenderedVideoUrl, setSubtitles, addToast, showToast,
  } = deps;

  setProcessing(false);
  setActiveOcrJobId(null);
  setActiveBlurJobId(null);

  if (data.success) {
    // OCR finish may carry subtitles; blur finish must not overwrite the editor list.
    const isOcrJob = !data.job_id || data.job_id.startsWith('ocr_');
    if (isOcrJob && data.subtitles?.length) {
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

      // Active job: only restore progress for THAT job. Never apply a stale finish.
      if (res.has_active_job) {
        if (
          state?.type === 'progress'
          && (!state.job_id || state.job_id === res.job_id)
        ) {
          updateProgress(state.current, state.total, state.eta);
          lastProgressAt.current = Date.now();
          if (!local.isProcessing) setProcessing(true);
        }
        return;
      }

      // Job finished while tab was hidden / WS dropped.
      if (state?.type === 'finish') {
        if (local.isProcessing && !isRelevantJobEvent(state.job_id)) {
          return;
        }
        const alreadyDone = !local.isProcessing && (
          !!local.renderedVideoUrl || (local.progress.current === local.progress.total && local.progress.total > 0)
        );
        applyFinishState(state, {
          setProcessing, setActiveOcrJobId, setActiveBlurJobId,
          updateProgress, setRenderedVideoUrl, setSubtitles, addToast,
          showToast: showToast && !alreadyDone,
        });
        return;
      }

      // No active job — clear stuck UI (missed finish / progress overwrote terminal state).
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

  // Client → server ping so proxies / server receive-timeout don't kill long jobs.
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

  // If we sit at 100% still "processing", poll session status (finish often missed after WS drop).
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
        });
        break;
      case 'pong':
        break;
    }
  }, [
    lastJsonMessage, addLog, updateProgress, addSubtitle, updateSubtitle, setSubtitles,
    setProcessing, setActiveOcrJobId, setActiveBlurJobId,
    setRenderedVideoUrl, addToast
  ]);
};
