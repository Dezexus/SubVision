import { useMutation } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import { getApiErrorMessage } from '../../../shared/lib/errors';
import { useProcessingStore } from '../../../store/processingStore';
import { useUIStore } from '../../../store/uiStore';
import type { RenderConfig } from '../../../types';
import { translate } from '../../../i18n';

/**
 * Mutation hook for starting the smart blur rendering process.
 */
export function useStartBlurRender() {
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const setActiveBlurJobId = useProcessingStore((s) => s.setActiveBlurJobId);
  const setActiveOcrJobId = useProcessingStore((s) => s.setActiveOcrJobId);
  const setRenderedVideoUrl = useProcessingStore((s) => s.setRenderedVideoUrl);
  const addLog = useProcessingStore((s) => s.addLog);
  const addToast = useUIStore((s) => s.addToast);

  const mutation = useMutation({
    mutationFn: async (config: RenderConfig) => {
      return await api.renderBlurVideo(config);
    },
    onMutate: () => {
      setProcessing(true);
      setActiveOcrJobId(null);
      // Drop the previous result so Stop stays available during the new render.
      setRenderedVideoUrl(null);
      addLog('--- Starting Smart Render ---');
    },
    onSuccess: (data) => {
      setActiveBlurJobId(data.job_id);
    },
    onError: (err: unknown) => {
      setProcessing(false);
      setActiveBlurJobId(null);
      const msg = getApiErrorMessage(err, translate('toasts.renderStartFailed'));
      addToast(msg, 'error');
      addLog(`Error: ${msg}`);
      addLog('Error: Render failed to start.');
    }
  });

  return { execute: mutation.mutateAsync };
}