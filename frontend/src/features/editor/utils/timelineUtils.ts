/**
 * Utility functions for timeline layout calculations.
 */
import type { SubtitleItem } from '../../../types';

export type ProcessedSubtitle = SubtitleItem & { track: number };

export const calculateTracks = (subtitles: SubtitleItem[]): ProcessedSubtitle[] => {
  const sortedSubs = [...subtitles].sort((a, b) => a.start - b.start);
  const lanes: number[] = [];
  return sortedSubs.map(sub => {
    let assignedTrack = lanes.findIndex(laneEndTime => laneEndTime <= sub.start);
    if (assignedTrack === -1) {
      assignedTrack = lanes.length;
    }
    lanes[assignedTrack] = sub.end;
    return { ...sub, track: assignedTrack };
  });
};
