import { describe, expect, it } from 'vitest';
import { countTracks, fileSlug, subtitleAt, trackLabel, trackOf } from './tracks';
import { calculateTracks } from '../../features/timeline/utils/timelineUtils';
import type { SubtitleItem } from '../../types';

const cue = (id: number, start: number, end: number, track?: number): SubtitleItem =>
  ({ id, start, end, text: `t${id}`, conf: 1, track });

describe('tracks', () => {
  it('treats a missing track as track 0', () => {
    expect(trackOf(cue(1, 0, 1))).toBe(0);
    expect(trackOf(cue(1, 0, 1, 2))).toBe(2);
  });

  it('counts regions and tracks that already have cues', () => {
    expect(countTracks(1, [])).toBe(1);
    expect(countTracks(2, [cue(1, 0, 1)])).toBe(2);
    expect(countTracks(1, [cue(1, 0, 1, 2)])).toBe(3);
  });

  it('prefers the selected track when several cues are on screen', () => {
    const subs = [cue(1, 0, 2, 0), cue(2, 0, 2, 1)];
    expect(subtitleAt(subs, 1, 1)?.id).toBe(2);
    expect(subtitleAt(subs, 1, 0)?.id).toBe(1);
    expect(subtitleAt(subs, 1, 2)?.id).toBe(1);
    expect(subtitleAt(subs, 5, 0)).toBeUndefined();
  });
});

describe('track names', () => {
  it('falls back to the numbered label', () => {
    const fallback = (n: number) => `Track ${n}`;
    expect(trackLabel(['', 'Signs'], 0, fallback)).toBe('Track 1');
    expect(trackLabel(['', 'Signs'], 1, fallback)).toBe('Signs');
    expect(trackLabel([], 2, fallback)).toBe('Track 3');
  });

  it('makes ASCII file slugs, transliterating Cyrillic', () => {
    expect(fileSlug('Надписи на экране')).toBe('nadpisi-na-ekrane');
    expect(fileSlug('  Signs & Titles! ')).toBe('signs-titles');
    expect(fileSlug('日本語')).toBe('');
  });
});

describe('calculateTracks', () => {
  it('gives each subtitle track its own rows', () => {
    const lanes = calculateTracks([cue(1, 0, 2, 0), cue(2, 0, 2, 1), cue(3, 3, 4, 0)]);
    const laneOf = (id: number) => lanes.find((s) => s.id === id)!.lane;
    expect(laneOf(1)).toBe(0);
    expect(laneOf(3)).toBe(0);
    expect(laneOf(2)).toBe(1);
    expect(lanes.some((s) => s.hasOverlap)).toBe(false);
  });

  it('stacks overlaps within a track and flags them', () => {
    const lanes = calculateTracks([cue(1, 0, 2), cue(2, 1, 3), cue(3, 0, 5, 1)]);
    const byId = new Map(lanes.map((s) => [s.id, s]));
    expect(byId.get(2)!.lane).toBe(1);
    expect(byId.get(3)!.lane).toBe(2);
    expect(byId.get(1)!.hasOverlap && byId.get(2)!.hasOverlap).toBe(true);
    expect(byId.get(3)!.hasOverlap).toBeUndefined();
  });
});
