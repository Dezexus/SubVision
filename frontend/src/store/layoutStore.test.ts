import { describe, expect, it } from 'vitest';
import { PANEL_LIMITS, useLayoutStore } from './layoutStore';
import { setWorkspaceMode } from './workspace';
import { useBlurStore } from './blurStore';
import { useVideoStore } from './videoStore';

describe('layoutStore', () => {
  it('clamps panel widths to their limits', () => {
    useLayoutStore.getState().setWidth('left', 10);
    expect(useLayoutStore.getState().leftWidth).toBe(PANEL_LIMITS.left.min);
    useLayoutStore.getState().setWidth('right', 5000);
    expect(useLayoutStore.getState().rightWidth).toBe(PANEL_LIMITS.right.max);
  });

  it('persists the layout for the next session', () => {
    useLayoutStore.getState().setTimelineHeight(240);
    useLayoutStore.getState().toggleAlgoPreview();
    const saved = JSON.parse(localStorage.getItem('subvision_layout') ?? '{}');
    expect(saved.timelineHeight).toBe(240);
    expect(saved.algoPreviewOpen).toBe(useLayoutStore.getState().algoPreviewOpen);
  });
});

describe('workspace mode', () => {
  it('maps each stage to exactly one of the existing flags', () => {
    setWorkspaceMode('blur');
    expect([useBlurStore.getState().isBlurMode, useVideoStore.getState().isPreviewMode]).toEqual([true, false]);
    setWorkspaceMode('edit');
    expect([useBlurStore.getState().isBlurMode, useVideoStore.getState().isPreviewMode]).toEqual([false, true]);
    setWorkspaceMode('ocr');
    expect([useBlurStore.getState().isBlurMode, useVideoStore.getState().isPreviewMode]).toEqual([false, false]);
  });
});
