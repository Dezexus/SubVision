import { useCallback } from 'react';
import { useProcessingStore } from '../store/processingStore';
import { useVideoStore } from '../store/videoStore';
import { useUIStore } from '../store/uiStore';

const formatSrtTime = (seconds: number) => {
  const date = new Date(0);
  date.setSeconds(seconds);
  date.setMilliseconds((seconds % 1) * 1000);
  const iso = date.toISOString().substr(11, 12);
  return iso.replace('.', ',');
};

export function useExportSrt() {
  const subtitles = useProcessingStore((s) => s.subtitles);
  const metadata = useVideoStore((s) => s.metadata);
  const addToast = useUIStore((s) => s.addToast);

  const execute = useCallback(() => {
    if (!metadata || subtitles.length === 0) {
      addToast('No subtitles to export', 'error');
      return;
    }
    let srt = '';
    subtitles.forEach((sub, i) => {
      srt += `${i + 1}\n`;
      srt += `${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n`;
      srt += `${sub.text}\n\n`;
    });
    const blob = new Blob(['\uFEFF', srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.filename.replace(/\.[^/.]+$/, '')}_edited.srt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast('SRT exported', 'success');
  }, [subtitles, metadata, addToast]);

  return { execute };
}