import { describe, expect, it } from 'vitest';
import { countTracks, fileSlug, subtitleAt, trackLabel, trackOf } from './tracks';
import { formatDuration, formatRulerTime, layoutTimeline, rulerStep } from '../../features/timeline/utils/timelineUtils';
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

describe('layoutTimeline', () => {
  it('gives each subtitle track its own rows', () => {
    const { clips, rows } = layoutTimeline([cue(1, 0, 2, 0), cue(2, 0, 2, 1), cue(3, 3, 4, 0)], 2);
    const laneOf = (id: number) => clips.find((s) => s.id === id)!.lane;
    expect([laneOf(1), laneOf(3), laneOf(2)]).toEqual([0, 0, 1]);
    expect(rows).toEqual([{ track: 0, firstLane: 0, lanes: 1 }, { track: 1, firstLane: 1, lanes: 1 }]);
    expect(clips.some((s) => s.hasOverlap)).toBe(false);
  });

  it('keeps a row for a track without cues', () => {
    const { rows, laneCount } = layoutTimeline([cue(1, 0, 1, 0)], 3);
    expect(rows.map((r) => r.firstLane)).toEqual([0, 1, 2]);
    expect(laneCount).toBe(3);
  });

  it('stacks overlaps within a track and flags them', () => {
    const { clips, rows } = layoutTimeline([cue(1, 0, 2), cue(2, 1, 3), cue(3, 0, 5, 1)], 2);
    const byId = new Map(clips.map((s) => [s.id, s]));
    expect(byId.get(2)!.lane).toBe(1);
    expect(byId.get(3)!.lane).toBe(2);
    expect(rows[0].lanes).toBe(2);
    expect(byId.get(1)!.hasOverlap && byId.get(2)!.hasOverlap).toBe(true);
    expect(byId.get(3)!.hasOverlap).toBeUndefined();
  });
});

describe('ruler', () => {
  it('spaces labels at least ~72px apart', () => {
    expect(rulerStep(100)).toEqual({ major: 1, minor: 0.5 });
    expect(rulerStep(5)).toEqual({ major: 15, minor: 3 });
    expect(rulerStep(1).major).toBe(120);
  });

  it('goes below a second at high zoom', () => {
    expect(rulerStep(800)).toEqual({ major: 0.1, minor: 0.05 });
    expect(rulerStep(200)).toEqual({ major: 0.5, minor: 0.1 });
  });

  it('formats ruler labels', () => {
    expect(formatRulerTime(75)).toBe('1:15');
    expect(formatRulerTime(3725)).toBe('1:02:05');
    expect(formatRulerTime(61.5)).toBe('1:01.5');
    expect(formatDuration(2.44)).toBe('2.4');
    expect(formatDuration(12.6)).toBe('13');
  });
});
