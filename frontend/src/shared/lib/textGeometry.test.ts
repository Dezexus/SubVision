import { describe, it, expect } from 'vitest';
import { estimateTextWidth, calculateTextRect } from './textGeometry';

describe('estimateTextWidth', () => {
  it('returns 0 for empty text', () => {
    expect(estimateTextWidth('', 30, 1.0)).toBe(0);
  });

  it('matches backend-style width for ASCII sample', () => {
    const width = estimateTextWidth('Hello world', 30, 1.0);
    expect(width).toBeGreaterThan(100);
    expect(width).toBeLessThan(250);
  });

  it('scales with font size and multiplier', () => {
    const base = estimateTextWidth('Test', 20, 1.0);
    const scaled = estimateTextWidth('Test', 40, 1.0);
    expect(scaled).toBeGreaterThan(base);
  });
});

describe('calculateTextRect', () => {
  const settings = {
    y: 900,
    font_size: 30,
    width_multiplier: 1.0,
    height_multiplier: 1.2,
  };

  it('returns zero rect for empty text', () => {
    expect(calculateTextRect('', 1920, 1080, settings)).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  it('stays within frame bounds', () => {
    const rect = calculateTextRect('Sample subtitle', 1920, 1080, settings);
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.w).toBeLessThanOrEqual(1920);
    expect(rect.y + rect.h).toBeLessThanOrEqual(1080);
  });

  it('centers horizontally', () => {
    const rect = calculateTextRect('Hi', 1920, 1080, settings);
    const centerX = rect.x + rect.w / 2;
    expect(centerX).toBeCloseTo(960, -1);
  });

  it('handles multiline text height', () => {
    const single = calculateTextRect('Line', 1920, 1080, settings);
    const multi = calculateTextRect('Line\nLine', 1920, 1080, settings);
    expect(multi.h).toBeGreaterThan(single.h);
  });
});
