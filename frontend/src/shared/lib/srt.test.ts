import { describe, expect, it } from 'vitest';
import { buildSrt, formatSrtTime } from './srt';

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
