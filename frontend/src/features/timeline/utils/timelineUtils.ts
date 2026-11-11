import type { SubtitleItem } from '../../../types';
import { trackOf } from '../../../shared/lib/tracks';

export interface ProcessedSubtitle extends SubtitleItem {
  /** Visual row on the timeline (not the subtitle track). */
  lane: number;
  /** Overlaps another cue of the same subtitle track. */
  hasOverlap?: boolean;
}

/** Block of rows that belongs to one subtitle track. */
export interface TrackRow {
  track: number;
  firstLane: number;
  lanes: number;
}

export interface TimelineLayout {
  clips: ProcessedSubtitle[];
  rows: TrackRow[];
  laneCount: number;
}

/**
 * Lays subtitles out in rows: each subtitle track gets its own block of rows
 * (an empty track still gets one), and overlapping cues within a track stack
 * into extra rows.
 */
export const layoutTimeline = (subtitles: SubtitleItem[], trackCount = 1): TimelineLayout => {
  const byTrack = new Map<number, SubtitleItem[]>();
  for (const sub of subtitles) {
    const track = trackOf(sub);
    byTrack.set(track, [...(byTrack.get(track) ?? []), sub]);
  }
  const totalTracks = Math.max(trackCount, ...[...byTrack.keys()].map((t) => t + 1), 1);

  const clips: ProcessedSubtitle[] = [];
  const rows: TrackRow[] = [];
  let laneOffset = 0;

  for (let track = 0; track < totalTracks; track++) {
    const sorted = [...(byTrack.get(track) ?? [])].sort((a, b) => a.start - b.start);
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

    const lanes = Math.max(1, laneEnds.length);
    clips.push(...group);
    rows.push({ track, firstLane: laneOffset, lanes });
    laneOffset += lanes;
  }

  return { clips, rows, laneCount: laneOffset };
};

/** Ruler steps in seconds, from fine to coarse. */
const RULER_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

/**
 * Labelled tick spacing so labels stay at least `minPx` apart, plus the minor
 * tick spacing between them.
 */
export function rulerStep(pxPerSecond: number, minPx = 72): { major: number; minor: number } {
  const major = RULER_STEPS.find((s) => s * pxPerSecond >= minPx) ?? RULER_STEPS[RULER_STEPS.length - 1];
  const minor = major % 5 === 0 ? major / 5 : major / 2;
  return { major, minor };
}

/** Short ruler label: `m:ss`, or `h:mm:ss` past an hour. */
export function formatRulerTime(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
