import type { SubtitleItem } from '../../types';
import { fileSlug, trackOf } from './tracks';

const pad = (n: number, width = 2) => n.toString().padStart(width, '0');

/** Format seconds as an SRT timestamp `HH:MM:SS,mmm`, rounded to the millisecond. */
export function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export interface TrackSrtOptions {
  /** User track names, used in file names (transliterated to ASCII). */
  names?: string[];
  /** Export only this track. */
  only?: number;
}

/**
 * One SRT per non-empty track, ordered by track. A single-track project keeps
 * the plain `_edited.srt`; otherwise files get `_trackN[_name]` to stay apart.
 */
export function buildTrackSrts(
  subtitles: SubtitleItem[],
  { names = [], only }: TrackSrtOptions = {},
): { track: number; suffix: string; srt: string }[] {
  const byTrack = new Map<number, SubtitleItem[]>();
  for (const sub of subtitles) {
    const track = trackOf(sub);
    byTrack.set(track, [...(byTrack.get(track) ?? []), sub]);
  }
  const tracks = [...byTrack.keys()].sort((a, b) => a - b);
  const multi = tracks.length > 1;
  return tracks
    .filter((track) => only === undefined || track === only)
    .map((track) => {
      const slug = fileSlug(names[track] ?? '');
      return {
        track,
        suffix: multi ? `_track${track + 1}${slug ? `_${slug}` : ''}.srt` : '_edited.srt',
        srt: buildSrt([...byTrack.get(track)!].sort((a, b) => a.start - b.start)),
      };
    });
}

export function buildSrt(subtitles: SubtitleItem[]): string {
  return subtitles
    .map((sub, i) => `${i + 1}\n${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n${sub.text}\n`)
    .join('\n');
}
