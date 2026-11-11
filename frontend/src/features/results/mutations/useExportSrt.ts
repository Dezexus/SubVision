import { useCallback } from 'react';
import { exportStem, exportWithSuffix } from '../../../shared/lib';
import { buildSrt } from '../../../shared/lib/srt';
import { translate } from '../../../i18n';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import { useUIStore } from '../../../store/uiStore';

/**
 * Hook to export subtitles to an SRT file format.
 */
export function useExportSrt() {
  const subtitles = useProcessingStore((s) => s.subtitles);
  const metadata = useVideoStore((s) => s.metadata);
  const addToast = useUIStore((s) => s.addToast);

  const execute = useCallback(() => {
    if (!metadata || subtitles.length === 0) {
      addToast(translate('toasts.noSubtitlesExport'), 'error');
      return;
    }
    const blob = new Blob(['﻿', buildSrt(subtitles)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const stem = exportStem(metadata.original_filename, metadata.filename);
    a.download = exportWithSuffix(stem, '_edited.srt');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(translate('toasts.srtExported'), 'success');
  }, [subtitles, metadata, addToast]);

  return { execute };
}
