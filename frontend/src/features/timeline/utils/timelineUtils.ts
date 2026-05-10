import type { SubtitleItem } from '../../../types';

export interface ProcessedSubtitle extends SubtitleItem {
  track: number;
  hasOverlap?: boolean;
}

/**
 * Calculates tracks for subtitles to prevent visual overlapping and detects timing collisions.
 * Optimizes layout for OCR cleanup workflow.
 */
export const calculateTracks = (subtitles: SubtitleItem[]): ProcessedSubtitle[] => {
  const sorted = [...subtitles].sort((a, b) => a.start - b.start);
  const tracks: number[] = [];
  const processed: ProcessedSubtitle[] = [];

  sorted.forEach((sub) => {
    let track = 0;
    while (tracks[track] > sub.start) {
      track++;
    }
    tracks[track] = sub.end;
    processed.push({ ...sub, track });
  });

  for (let i = 0; i < processed.length; i++) {
    const current = processed[i];
    for (let j = i + 1; j < processed.length; j++) {
      const next = processed[j];
      if (next.start > current.end) break;
      if (next.track === current.track && next.start < current.end) {
        current.hasOverlap = true;
        next.hasOverlap = true;
      }
    }
  }

  return processed;
};