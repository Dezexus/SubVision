import { useBlurStore } from './blurStore';
import { useVideoStore } from './videoStore';

/**
 * The three stages of the work: recognize (ROI + OCR), edit (player and
 * cue editors) and remove (blur/inpaint render). Stored as the existing
 * `isBlurMode` / `isPreviewMode` flags so their consumers keep working.
 */
export type WorkspaceMode = 'ocr' | 'edit' | 'blur';

export function useWorkspaceMode(): WorkspaceMode {
  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const isPreviewMode = useVideoStore((s) => s.isPreviewMode);
  if (isBlurMode) return 'blur';
  return isPreviewMode ? 'edit' : 'ocr';
}

export function setWorkspaceMode(mode: WorkspaceMode): void {
  useBlurStore.getState().setBlurMode(mode === 'blur');
  useVideoStore.getState().setPreviewMode(mode === 'edit');
}
