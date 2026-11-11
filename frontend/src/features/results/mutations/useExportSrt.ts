import { useCallback } from 'react';
import { exportStem, exportWithSuffix } from '../../../shared/lib';
import { buildTrackSrts } from '../../../shared/lib/srt';
import { translate } from '../../../i18n';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import { useUIStore } from '../../../store/uiStore';

function downloadText(text: string, filename: string): void {
  const blob = new Blob(['﻿', text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Hook to export subtitles as SRT: every track (one file each) or a single track.
 */
export function useExportSrt() {
  const subtitles = useProcessingStore((s) => s.subtitles);
  const metadata = useVideoStore((s) => s.metadata);
  const trackNames = useVideoStore((s) => s.trackNames);
  const addToast = useUIStore((s) => s.addToast);

  const execute = useCallback((only?: number) => {
    if (!metadata || subtitles.length === 0) {
      addToast(translate('toasts.noSubtitlesExport'), 'error');
      return;
    }
    const files = buildTrackSrts(subtitles, { names: trackNames, only });
    if (files.length === 0) {
      addToast(translate('toasts.noSubtitlesExport'), 'error');
      return;
    }
    const stem = exportStem(metadata.original_filename, metadata.filename);
    // The browser shows the downloads; no toast needed.
    for (const { suffix, srt } of files) {
      downloadText(srt, exportWithSuffix(stem, suffix));
    }
  }, [subtitles, metadata, trackNames, addToast]);

  return { execute };
}
