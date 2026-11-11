import { beforeEach, describe, expect, it } from 'vitest';
import { useVideoStore } from './videoStore';
import { useProcessingStore } from './processingStore';
import { settingsForTrack, useBlurStore } from './blurStore';
import type { SubtitleItem, VideoMetadata } from '../types';

const video = () => useVideoStore.getState();
const cue = (id: number, track: number): SubtitleItem => ({ id, start: id, end: id + 1, text: `t${id}`, conf: 1, track });

const metadata: VideoMetadata = {
  filename: 'v.mp4', original_filename: 'v.mp4', total_frames: 100, width: 1920, height: 1080,
  fps: 25, duration: 4, display_aspect_ratio: 16 / 9,
};

describe('videoStore tracks', () => {
  beforeEach(() => {
    video().reset();
    useProcessingStore.getState().reset();
    useBlurStore.getState().reset();
    localStorage.clear();
  });

  it('adds up to three regions and makes the new one current', () => {
    video().addTrack();
    expect(video().activeTrack).toBe(1);
    video().addTrack();
    video().addTrack();
    expect(video().rois).toHaveLength(3);
  });

  it('removes a middle track and shifts everything after it', () => {
    video().addTrack();
    video().addTrack();
    video().setActiveTrack(2);
    video().setRoi([0, 0, 30, 30]);
    video().renameTrack(1, 'Signs');
    video().renameTrack(2, 'Credits');
    useProcessingStore.getState().setSubtitles([cue(1, 0), cue(2, 1), cue(3, 2)]);
    useBlurStore.getState().setTrackSettings(2, { y: 77 });

    video().removeTrack(1);

    expect(video().rois).toEqual([[0, 0, 0, 0], [0, 0, 30, 30]]);
    expect(video().trackNames).toEqual(['', 'Credits']);
    expect(video().activeTrack).toBe(1);
    expect(useProcessingStore.getState().subtitles.map((s) => [s.id, s.track])).toEqual([[1, 0], [3, 1]]);
    expect(settingsForTrack(useBlurStore.getState(), 1).y).toBe(77);
  });

  it('makes dropping cues undoable', () => {
    video().addTrack();
    useProcessingStore.getState().setSubtitles([cue(1, 0), cue(2, 1)]);
    video().removeTrack(1);
    useProcessingStore.getState().undo();
    expect(useProcessingStore.getState().subtitles).toHaveLength(2);
  });

  it('keeps regions and names across a reload', () => {
    video().setMetadata(metadata);
    video().addTrack();
    video().setRoi([10, 20, 30, 40]);
    video().renameTrack(1, '  Signs  ');

    useVideoStore.setState({ metadata: null, rois: [[0, 0, 0, 0]], trackNames: [] });
    video().restoreVideoState();

    expect(video().rois).toEqual([[0, 0, 0, 0], [10, 20, 30, 40]]);
    expect(video().trackNames).toEqual(['', 'Signs']);
  });
});
