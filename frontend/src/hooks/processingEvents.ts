/**
 * Pure job-event handling shared by the WebSocket hook and session recovery.
 * Everything here reads and writes the zustand stores directly, so it runs
 * (and is tested) without React.
 */
import { useProcessingStore } from '../store/processingStore';
import { useUIStore } from '../store/uiStore';
import { translate } from '../i18n';
import type { SessionStatus, WebSocketMessage } from '../types';

export type JobKind = 'ocr' | 'blur';
type FinishMessage = Extract<WebSocketMessage, { type: 'finish' }>;

/** Job IDs are `{ocr|blur}_{client_id}_{8hex}` (contract with the backend). */
export function jobKind(jobId: string | null | undefined): JobKind | null {
  if (!jobId) return null;
  if (jobId.startsWith('ocr_')) return 'ocr';
  if (jobId.startsWith('blur_')) return 'blur';
  return null;
}

function activeJobIds(): string[] {
  const { activeOcrJobId, activeBlurJobId } = useProcessingStore.getState();
  return [activeOcrJobId, activeBlurJobId].filter((id): id is string => !!id);
}

export function bindActiveJobId(jobId: string | null | undefined): void {
  const kind = jobKind(jobId);
  if (!kind || !jobId) return;
  const store = useProcessingStore.getState();
  if (kind === 'ocr') {
    if (store.activeOcrJobId !== jobId) store.setActiveOcrJobId(jobId);
    if (store.activeBlurJobId) store.setActiveBlurJobId(null);
  } else {
    if (store.activeBlurJobId !== jobId) store.setActiveBlurJobId(jobId);
    if (store.activeOcrJobId) store.setActiveOcrJobId(null);
  }
}

export function isRelevantJobEvent(jobId: string | undefined): boolean {
  const { isProcessing, stoppedJobId } = useProcessingStore.getState();
  if (jobId && stoppedJobId && jobId === stoppedJobId) return false;
  if (!isProcessing) return false;
  const ids = activeJobIds();
  if (ids.length === 0 || !jobId) return false;
  return ids.includes(jobId);
}

function finishJob(): void {
  const store = useProcessingStore.getState();
  store.setProcessing(false);
  store.setActiveOcrJobId(null);
  store.setActiveBlurJobId(null);
}

function applyFinishState(data: FinishMessage, showToast: boolean): void {
  finishJob();
  const store = useProcessingStore.getState();
  const addToast = useUIStore.getState().addToast;
  const kind = jobKind(data.job_id);

  if (!data.success) {
    if (showToast) addToast(data.error || translate('toasts.taskFailed'), 'error');
    return;
  }

  if (kind !== 'blur' && data.subtitles?.length) {
    store.setSubtitles(data.subtitles);
  }
  const { current, total } = store.progress;
  const done = Math.max(current, total, 1);
  store.updateProgress(done, done, '00:00');

  if (kind !== 'ocr' && data.download_url) {
    store.setRenderedVideoUrl(data.download_url);
    if (showToast) addToast(translate('toasts.renderCompleted'), 'success');
  } else if (showToast) {
    addToast(translate('toasts.processCompleted'), 'success');
  }
}

/** Recover a finished result we missed, without clobbering local edits. */
function softRecoverFinish(data: FinishMessage): void {
  if (!data.success) return;
  const store = useProcessingStore.getState();
  const kind = jobKind(data.job_id);
  if (kind !== 'blur' && data.subtitles?.length && store.subtitles.length === 0) {
    store.setSubtitles(data.subtitles);
  }
  if (kind !== 'ocr' && data.download_url && !store.renderedVideoUrl) {
    store.setRenderedVideoUrl(data.download_url);
  }
}

export interface EventOutcome {
  /** A progress event was applied (resets the stall watchdog). */
  progressed: boolean;
  /** Terminal state to acknowledge through `POST /api/session/ack`. */
  ackJobId?: string;
}

/** Apply one WebSocket event. Must be called for every message, in order. */
export function handleSocketMessage(data: WebSocketMessage): EventOutcome {
  const store = useProcessingStore.getState();
  switch (data.type) {
    case 'progress':
      if (!isRelevantJobEvent(data.job_id)) break;
      store.updateProgress(data.current, data.total, data.eta);
      return { progressed: true };
    case 'subtitle_new':
      if (!isRelevantJobEvent(data.job_id)) break;
      store.addSubtitle(data.item);
      break;
    case 'subtitles_replace':
      if (!isRelevantJobEvent(data.job_id)) break;
      store.setSubtitles(data.items);
      break;
    case 'finish':
      if (!isRelevantJobEvent(data.job_id)) break;
      applyFinishState(data, true);
      return { progressed: false, ackJobId: data.job_id };
    case 'log':
    case 'pong':
      break;
  }
  return { progressed: false };
}

/** Reconcile local state with `GET /api/session/status`. */
export function applySessionStatus(res: SessionStatus, opts: { showToast: boolean }): EventOutcome {
  const state = res.last_state;
  const local = useProcessingStore.getState();

  if (res.has_active_job && res.job_id) {
    bindActiveJobId(res.job_id);
    if (!local.isProcessing) local.setProcessing(true);
    const sameJob = !state?.job_id || state.job_id === res.job_id;
    if (state?.type === 'progress' && sameJob) {
      local.updateProgress(state.current, state.total, state.eta);
      return { progressed: true };
    }
    if (state?.type === 'finish' && sameJob) {
      applyFinishState(state, opts.showToast);
      return { progressed: false, ackJobId: state.job_id || res.job_id };
    }
    return { progressed: false };
  }

  if (state?.type === 'finish') {
    if (local.isProcessing) applyFinishState(state, opts.showToast);
    else softRecoverFinish(state);
    return { progressed: false, ackJobId: state.job_id };
  }

  if (local.isProcessing) {
    finishJob();
    const { current, total } = local.progress;
    if (total > 0) {
      const done = Math.max(current, total);
      local.updateProgress(done, done, '00:00');
    }
  }
  return { progressed: false };
}
