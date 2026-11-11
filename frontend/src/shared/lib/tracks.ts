import type { SubtitleItem } from '../../types';

/** The UI offers up to this many subtitle regions (the backend caps it too). */
export const MAX_TRACKS = 3;

export const trackOf = (sub: Pick<SubtitleItem, 'track'>): number => sub.track ?? 0;

/** Number of tracks to show: every region plus any track that already has cues. */
export function countTracks(regionCount: number, subtitles: SubtitleItem[]): number {
  let count = Math.max(1, regionCount);
  for (const sub of subtitles) count = Math.max(count, trackOf(sub) + 1);
  return count;
}

/** Tailwind classes per track, shared by the canvas, list and timeline. */
export const TRACK_COLORS = [
  { text: 'text-sky-400', border: 'border-sky-400', bg: 'bg-sky-400', soft: 'bg-sky-400/15' },
  { text: 'text-fuchsia-400', border: 'border-fuchsia-400', bg: 'bg-fuchsia-400', soft: 'bg-fuchsia-400/15' },
  { text: 'text-amber-400', border: 'border-amber-400', bg: 'bg-amber-400', soft: 'bg-amber-400/15' },
] as const;

export const trackColor = (track: number) => TRACK_COLORS[track % TRACK_COLORS.length];

/** Subtitle at `time`, preferring the given track when several are on screen. */
export function subtitleAt<T extends SubtitleItem>(subtitles: T[], time: number, preferTrack?: number): T | undefined {
  let fallback: T | undefined;
  for (const sub of subtitles) {
    if (time < sub.start || time > sub.end) continue;
    if (preferTrack === undefined || trackOf(sub) === preferTrack) return sub;
    fallback ??= sub;
  }
  return fallback;
}

/** Display name of a track: the user's name, else "Track N" from `fallback`. */
export function trackLabel(names: string[], track: number, fallback: (n: number) => string): string {
  return names[track]?.trim() || fallback(track + 1);
}

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/** ASCII slug for file names (export names allow only [A-Za-z0-9._- ]). */
export function fileSlug(name: string): string {
  return [...name.trim().toLowerCase()]
    .map((ch) => CYRILLIC[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
