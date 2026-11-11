import { beforeEach, describe, expect, it } from 'vitest';
import { useProcessingStore } from './processingStore';
import type { SubtitleItem } from '../types';

const sub = (id: number, text = `line ${id}`, start = id, end = id + 1): SubtitleItem => ({
  id, start, end, text, conf: 0.9,
});

const store = () => useProcessingStore.getState();

describe('processingStore history', () => {
  beforeEach(() => {
    store().reset();
    store().setSubtitles([sub(1), sub(2)]);
  });

  it('server setSubtitles starts a fresh history', () => {
    store().deleteSubtitle(1);
    expect(store().pastSubtitles).toHaveLength(1);
    store().setSubtitles([sub(3)]);
    expect(store().pastSubtitles).toHaveLength(0);
    expect(store().futureSubtitles).toHaveLength(0);
  });

  it('importSubtitles is one undoable step', () => {
    store().importSubtitles([sub(9)]);
    store().undo();
    expect(store().subtitles.map((s) => s.id)).toEqual([1, 2]);
  });

  it('records one step for a continuous edit, on the first change', () => {
    store().beginEdit();
    expect(store().pastSubtitles).toHaveLength(0);
    store().updateSubtitle(1, { text: 'a' });
    store().updateSubtitle(1, { text: 'ab' });
    store().updateSubtitle(1, { text: 'abc' });
    store().endEdit();
    expect(store().pastSubtitles).toHaveLength(1);
    store().undo();
    expect(store().subtitles[0].text).toBe('line 1');
  });

  it('focus without a change keeps the redo stack', () => {
    store().deleteSubtitle(2);
    store().undo();
    expect(store().futureSubtitles).toHaveLength(1);
    store().beginEdit();
    store().endEdit();
    expect(store().futureSubtitles).toHaveLength(1);
    expect(store().pastSubtitles).toHaveLength(0);
  });

  it('updateSubtitle patches the current item, not a stale copy', () => {
    const stale = store().subtitles[0];
    store().updateSubtitle(1, { start: 0.25 });
    store().updateSubtitle(stale.id, { text: 'new' });
    const fresh = store().subtitles[0];
    expect(fresh.start).toBe(0.25);
    expect(fresh.text).toBe('new');
    expect(fresh.isEdited).toBe(true);
  });

  it('updateSubtitle on a missing id is a no-op', () => {
    store().beginEdit();
    store().updateSubtitle(42, { text: 'x' });
    expect(store().pastSubtitles).toHaveLength(0);
    expect(store().editPending).toBe(true);
  });

  it('undo and redo round-trip', () => {
    store().mergeSubtitles(0);
    expect(store().subtitles).toHaveLength(1);
    store().undo();
    expect(store().subtitles).toHaveLength(2);
    store().redo();
    expect(store().subtitles[0].text).toBe('line 1 line 2');
  });
});
