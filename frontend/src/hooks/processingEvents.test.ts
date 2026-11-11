import { beforeEach, describe, expect, it } from 'vitest';
import { useProcessingStore } from '../store/processingStore';
import { useUIStore } from '../store/uiStore';
import type { SubtitleItem } from '../types';
import {
  applySessionStatus,
  bindActiveJobId,
  handleSocketMessage,
  isRelevantJobEvent,
  jobKind,
} from './processingEvents';

const OCR_JOB = 'ocr_client_0000aaaa';
const OLD_OCR_JOB = 'ocr_client_1111bbbb';
const BLUR_JOB = 'blur_client_2222cccc';

const sub = (id: number): SubtitleItem => ({ id, start: id, end: id + 1, text: `t${id}`, conf: 0.9 });
const store = () => useProcessingStore.getState();

function startJob(jobId: string) {
  store().reset();
  bindActiveJobId(jobId);
  store().setProcessing(true);
}

beforeEach(() => {
  store().reset();
  useUIStore.setState({ toasts: [] });
});

describe('jobKind', () => {
  it('parses the job id prefix', () => {
    expect(jobKind(OCR_JOB)).toBe('ocr');
    expect(jobKind(BLUR_JOB)).toBe('blur');
    expect(jobKind('other')).toBeNull();
    expect(jobKind(undefined)).toBeNull();
  });
});

describe('isRelevantJobEvent', () => {
  it('accepts only the active job while processing', () => {
    startJob(OCR_JOB);
    expect(isRelevantJobEvent(OCR_JOB)).toBe(true);
    expect(isRelevantJobEvent(OLD_OCR_JOB)).toBe(false);
    expect(isRelevantJobEvent(undefined)).toBe(false);
  });

  it('rejects a stopped job and everything when idle', () => {
    startJob(OCR_JOB);
    store().setStoppedJobId(OCR_JOB);
    expect(isRelevantJobEvent(OCR_JOB)).toBe(false);
    store().setStoppedJobId(null);
    store().setProcessing(false);
    expect(isRelevantJobEvent(OCR_JOB)).toBe(false);
  });
});

describe('handleSocketMessage', () => {
  it('applies every message of a burst', () => {
    startJob(OCR_JOB);
    for (let i = 1; i <= 5; i++) {
      handleSocketMessage({ type: 'subtitle_new', item: sub(i), job_id: OCR_JOB });
    }
    expect(store().subtitles.map((s) => s.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it('ignores events of a replaced job', () => {
    startJob(OCR_JOB);
    handleSocketMessage({ type: 'subtitle_new', item: sub(1), job_id: OLD_OCR_JOB });
    const outcome = handleSocketMessage({ type: 'progress', current: 5, total: 10, eta: '', job_id: OLD_OCR_JOB });
    expect(store().subtitles).toHaveLength(0);
    expect(outcome.progressed).toBe(false);
  });

  it('reports progress', () => {
    startJob(OCR_JOB);
    const outcome = handleSocketMessage({ type: 'progress', current: 5, total: 10, eta: '00:05', job_id: OCR_JOB });
    expect(outcome.progressed).toBe(true);
    expect(store().progress).toEqual({ current: 5, total: 10, eta: '00:05' });
  });

  it('finishes an OCR job without leaving server results in undo history', () => {
    startJob(OCR_JOB);
    const outcome = handleSocketMessage({
      type: 'finish', success: true, subtitles: [sub(1), sub(2)], job_id: OCR_JOB,
    });
    expect(outcome.ackJobId).toBe(OCR_JOB);
    expect(store().isProcessing).toBe(false);
    expect(store().activeOcrJobId).toBeNull();
    expect(store().subtitles).toHaveLength(2);
    expect(store().pastSubtitles).toHaveLength(0);
    expect(useUIStore.getState().toasts.at(-1)?.type).toBe('success');
  });

  it('finishes a blur job without touching subtitles', () => {
    startJob(BLUR_JOB);
    store().setSubtitles([sub(1)]);
    handleSocketMessage({
      type: 'finish', success: true, download_url: '/uploads/out.mp4', subtitles: [sub(7)], job_id: BLUR_JOB,
    });
    expect(store().renderedVideoUrl).toBe('/uploads/out.mp4');
    expect(store().subtitles.map((s) => s.id)).toEqual([1]);
  });

  it('shows the error of a failed job', () => {
    startJob(OCR_JOB);
    handleSocketMessage({ type: 'finish', success: false, error: 'Task Cancelled', job_id: OCR_JOB });
    expect(store().isProcessing).toBe(false);
    expect(useUIStore.getState().toasts.at(-1)).toMatchObject({ type: 'error', message: 'Task Cancelled' });
  });
});

describe('applySessionStatus', () => {
  it('rebinds a running job after reload', () => {
    const outcome = applySessionStatus({
      has_active_job: true,
      job_id: BLUR_JOB,
      last_state: { type: 'progress', current: 3, total: 9, eta: '', job_id: BLUR_JOB },
    }, { showToast: false });
    expect(store().isProcessing).toBe(true);
    expect(store().activeBlurJobId).toBe(BLUR_JOB);
    expect(store().progress.current).toBe(3);
    expect(outcome.progressed).toBe(true);
  });

  it('soft-recovers a missed result without clobbering local edits', () => {
    store().setSubtitles([sub(1)]);
    const outcome = applySessionStatus({
      has_active_job: false,
      job_id: null,
      last_state: { type: 'finish', success: true, subtitles: [sub(8), sub(9)], job_id: OCR_JOB },
    }, { showToast: true });
    expect(store().subtitles.map((s) => s.id)).toEqual([1]);
    expect(outcome.ackJobId).toBe(OCR_JOB);
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('clears a stale processing flag when the server has no job', () => {
    startJob(OCR_JOB);
    applySessionStatus({ has_active_job: false, job_id: null, last_state: null }, { showToast: false });
    expect(store().isProcessing).toBe(false);
    expect(store().activeOcrJobId).toBeNull();
  });
});
