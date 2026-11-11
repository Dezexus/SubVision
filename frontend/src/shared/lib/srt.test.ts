import { describe, expect, it } from 'vitest';
import { buildSrt, buildTrackSrts, formatSrtTime } from './srt';

describe('formatSrtTime', () => {
  it('formats hours, minutes, seconds and milliseconds', () => {
    expect(formatSrtTime(0)).toBe('00:00:00,000');
    expect(formatSrtTime(3661.5)).toBe('01:01:01,500');
  });

  it('rounds to the nearest millisecond instead of truncating', () => {
    expect(formatSrtTime(0.1 + 0.2)).toBe('00:00:00,300');
    expect(formatSrtTime(1.9996)).toBe('00:00:02,000');
    expect(formatSrtTime(2.0029)).toBe('00:00:02,003');
  });

  it('clamps negatives and keeps hours above 24', () => {
    expect(formatSrtTime(-1)).toBe('00:00:00,000');
    expect(formatSrtTime(90000)).toBe('25:00:00,000');
  });
});

describe('buildSrt', () => {
  it('numbers cues and separates them with blank lines', () => {
    const srt = buildSrt([
      { id: 5, start: 1, end: 2, text: 'Hello', conf: 1 },
      { id: 9, start: 3, end: 4.25, text: 'World', conf: 1 },
    ]);
    expect(srt).toBe(
      '1\n00:00:01,000 --> 00:00:02,000\nHello\n\n2\n00:00:03,000 --> 00:00:04,250\nWorld\n',
    );
  });
});

describe('buildTrackSrts', () => {
  const cue = (id: number, start: number, text: string, track?: number) =>
    ({ id, start, end: start + 1, text, conf: 1, track });

  it('keeps the plain name for a single track', () => {
    expect(buildTrackSrts([cue(1, 0, 'a'), cue(2, 2, 'b')]).map((f) => f.suffix)).toEqual(['_edited.srt']);
  });

  it('writes one numbered file per track, each numbered from 1', () => {
    const files = buildTrackSrts([cue(1, 0, 'bottom', 0), cue(2, 0.5, 'top', 1), cue(3, 2, 'bottom2', 0)]);
    expect(files.map((f) => f.suffix)).toEqual(['_track1.srt', '_track2.srt']);
    expect(files[0].srt).toContain('2\n00:00:02,000');
    expect(files[1].srt.startsWith('1\n00:00:00,500 --> 00:00:01,500\ntop')).toBe(true);
  });

  it('puts transliterated track names in file names and can export one track', () => {
    const subs = [cue(1, 0, 'a', 0), cue(2, 0, 'b', 1)];
    const files = buildTrackSrts(subs, { names: ['Диалоги', ''], only: 0 });
    expect(files.map((f) => f.suffix)).toEqual(['_track1_dialogi.srt']);
    expect(buildTrackSrts(subs, { only: 1 }).map((f) => f.suffix)).toEqual(['_track2.srt']);
  });
});
