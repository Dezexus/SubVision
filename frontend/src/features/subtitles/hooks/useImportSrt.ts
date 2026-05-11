/**
 * Hook to import an .srt file and parse it into the subtitle store.
 */
import { useCallback } from 'react';
import { useSubtitleStore } from '../../../store/subtitleStore';
import type { SubtitleItem } from '../../../types';

export const useImportSrt = () => {
  const setSubtitles = useSubtitleStore((s) => s.setSubtitles);

  const execute = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      
      const blocks = content.split(/\n\s*\n/);
      const parsedSubs: SubtitleItem[] = [];
      
      blocks.forEach((block) => {
        const lines = block.trim().split('\n');
        if (lines.length >= 3) {
          const timeLine = lines[1];
          const text = lines.slice(2).join('\n');
          const [startStr, endStr] = timeLine.split(' --> ');
          
          const parseTime = (timeStr: string) => {
            if (!timeStr) return 0;
            const [time, ms] = timeStr.split(',');
            const [hours, minutes, seconds] = time.split(':').map(Number);
            return hours * 3600 + minutes * 60 + seconds + (Number(ms) || 0) / 1000;
          };
          
          if (startStr && endStr) {
            parsedSubs.push({
              id: Date.now() + Math.random(),
              start: parseTime(startStr),
              end: parseTime(endStr),
              text: text.trim(),
              conf: 1,
              isEdited: false
            });
          }
        }
      });
      
      if (parsedSubs.length > 0) {
        setSubtitles(parsedSubs);
      }
    };
    reader.readAsText(file);
  }, [setSubtitles]);

  return { execute };
};