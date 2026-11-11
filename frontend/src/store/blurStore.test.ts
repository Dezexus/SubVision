import { beforeEach, describe, expect, it } from 'vitest';
import { allTrackSettings, settingsForTrack, useBlurStore } from './blurStore';
import type { BlurSettings } from '../types';

const defaults: BlurSettings = {
  mode: 'hybrid', y: 900, x_offset: 0, font_size: 30, sigma: 5, feather: 40,
  width_multiplier: 1, height_multiplier: 1.5, encoder: 'auto',
};

const store = () => useBlurStore.getState();

describe('blurStore per-track settings', () => {
  beforeEach(() => {
    store().reset();
    store().setDefaultBlurSettings(defaults);
  });

  it('falls back to the defaults for untouched tracks', () => {
    expect(settingsForTrack(store(), 2)).toEqual(defaults);
  });

  it('edits one track without touching the others', () => {
    store().setTrackSettings(1, { y: 120, mode: 'blur' });
    expect(settingsForTrack(store(), 1)).toMatchObject({ y: 120, mode: 'blur' });
    expect(settingsForTrack(store(), 0)).toEqual(defaults);
    expect(allTrackSettings(store(), 3).map((s) => s.y)).toEqual([900, 120, 900]);
  });

  it('resets a single track to the defaults', () => {
    store().setTrackSettings(0, { sigma: 50 });
    store().setTrackSettings(1, { sigma: 70 });
    store().resetTrack(0);
    expect(settingsForTrack(store(), 0).sigma).toBe(5);
    expect(settingsForTrack(store(), 1).sigma).toBe(70);
  });
});
