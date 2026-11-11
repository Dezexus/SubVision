import type { SubtitleItem } from '../../../types';
import { trackOf } from '../../../shared/lib/tracks';

export interface ProcessedSubtitle extends SubtitleItem {
  /** Visual row on the timeline (not the subtitle track). */
  lane: number;
  /** Overlaps another cue of the same subtitle track. */
  hasOverlap?: boolean;
}

/**
 * Lays subtitles out in rows: each subtitle track gets its own block of rows,
 * and overlapping cues within a track stack into extra rows.
 */
export const calculateTracks = (subtitles: SubtitleItem[]): ProcessedSubtitle[] => {
  const byTrack = new Map<number, SubtitleItem[]>();
  for (const sub of subtitles) {
    const track = trackOf(sub);
    byTrack.set(track, [...(byTrack.get(track) ?? []), sub]);
  }

  const processed: ProcessedSubtitle[] = [];
  let laneOffset = 0;

  for (const track of [...byTrack.keys()].sort((a, b) => a - b)) {
    const sorted = [...byTrack.get(track)!].sort((a, b) => a.start - b.start);
    const laneEnds: number[] = [];
    const group: ProcessedSubtitle[] = [];

    for (const sub of sorted) {
      let lane = 0;
      while (laneEnds[lane] > sub.start) lane++;
      laneEnds[lane] = sub.end;
      group.push({ ...sub, lane: laneOffset + lane });
    }

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[j].start >= group[i].end) break;
        group[i].hasOverlap = true;
        group[j].hasOverlap = true;
      }
    }

    processed.push(...group);
    laneOffset += Math.max(1, laneEnds.length);
  }

  return processed;
};
