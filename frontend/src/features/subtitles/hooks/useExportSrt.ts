/**
 * Hook to export the current subtitles as an .srt file.
 */
import { useCallback } from 'react';
import { useSubtitleStore } from '../../../store/subtitleStore';
import { useVideoStore } from '../../../store/videoStore';

export const useExportSrt = () => {
  const subtitles = useSubtitleStore((s) => s.subtitles);
  const metadata = useVideoStore((s) => s.metadata);

  const execute = useCallback(() => {
    if (subtitles.length === 0) return;

    const formatTime = (seconds: number) => {
      const date = new Date(Math.max(0, seconds) * 1000);
      const hh = String(date.getUTCHours()).padStart(2, '0');
      const mm = String(date.getUTCMinutes()).padStart(2, '0');
      const ss = String(date.getUTCSeconds()).padStart(2, '0');
      const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
      return `${hh}:${mm}:${ss},${ms}`;
    };

    const srtContent = subtitles.map((sub, index) => {
      return `${index + 1}\n${formatTime(sub.start)} --> ${formatTime(sub.end)}\n${sub.text}\n`;
    }).join('\n');

    const blob = new Blob([srtContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const safeName = metadata?.filename ? metadata.filename.replace(/\.[^/.]+$/, "") : "subtitles";
    link.download = `${safeName}.srt`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [subtitles, metadata]);

  return { execute };
};