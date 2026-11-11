import { useEffect, useRef, useState } from 'react';
import { Plus, X, Info } from 'lucide-react';
import { useVideoStore } from '../store/videoStore';
import { useProcessingStore } from '../store/processingStore';
import { useBlurStore } from '../store/blurStore';
import { cn, countTracks, MAX_TRACKS, trackColor, trackOf } from '../shared/lib';
import { useTranslation } from '../i18n';
import { useTrackLabel } from '../hooks/useTrackLabel';

const CONFIRM_MS = 3000;

/**
 * The one place to pick, add, rename and remove subtitle tracks. Everything
 * else (frame box, blur settings, list, import, hotkeys) follows the current track.
 */
export const TrackSwitcher = () => {
  const { t } = useTranslation();
  const label = useTrackLabel();
  const rois = useVideoStore((s) => s.rois);
  const activeTrack = useVideoStore((s) => s.activeTrack);
  const setActiveTrack = useVideoStore((s) => s.setActiveTrack);
  const addTrack = useVideoStore((s) => s.addTrack);
  const renameTrack = useVideoStore((s) => s.renameTrack);
  const removeTrack = useVideoStore((s) => s.removeTrack);
  const isPreviewMode = useVideoStore((s) => s.isPreviewMode);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const isBlurMode = useBlurStore((s) => s.isBlurMode);

  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const count = countTracks(rois.length, subtitles);
  const current = Math.min(activeTrack, count - 1);
  const cueCount = (track: number) => subtitles.filter((s) => trackOf(s) === track).length;
  const isUnset = (track: number) => !(rois[track]?.[2] > 0);

  useEffect(() => {
    if (confirmRemove === null) return;
    const timer = setTimeout(() => setConfirmRemove(null), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmRemove]);

  useEffect(() => {
    if (editing !== null) inputRef.current?.select();
  }, [editing]);

  const startRename = (track: number) => {
    setActiveTrack(track);
    setDraft(useVideoStore.getState().trackNames[track] ?? '');
    setEditing(track);
  };

  const commitRename = () => {
    if (editing !== null) renameTrack(editing, draft);
    setEditing(null);
  };

  const handleRemove = (track: number) => {
    // Removing cues needs a second click; an empty track goes at once.
    if (cueCount(track) > 0 && confirmRemove !== track) {
      setConfirmRemove(track);
      return;
    }
    setConfirmRemove(null);
    removeTrack(track);
  };

  // The ROI box is drawn only in the plain editor (not blur or preview).
  const hint = isBlurMode || isPreviewMode
    ? null
    : isUnset(current)
      ? t('tracks.drawHint', { name: label(current) })
      : count > 1 ? t('tracks.regionHint') : null;

  return (
    <div className="flex items-center gap-3 min-h-8 flex-wrap">
      <div className="flex items-center gap-1 bg-bg-panel border border-border-main rounded-lg p-1 shadow-sm">
        {Array.from({ length: count }, (_, track) => {
          const color = trackColor(track);
          const isCurrent = track === current;
          const confirming = confirmRemove === track;
          return (
            <div
              key={track}
              className={cn(
                'group/tab relative flex items-center rounded-md border transition-colors',
                isCurrent ? cn('bg-bg-surface', color.border) : 'border-transparent hover:bg-bg-hover',
              )}
            >
              {editing === track ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  placeholder={t('tracks.track', { n: track + 1 })}
                  maxLength={40}
                  className="w-32 bg-transparent px-2.5 py-1 text-xs font-semibold text-txt-main focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveTrack(track)}
                  onDoubleClick={() => startRename(track)}
                  onKeyDown={(e) => {
                    // Keyboard rename: F2, as in file managers.
                    if (e.key === 'F2') {
                      e.preventDefault();
                      startRename(track);
                    }
                  }}
                  aria-pressed={isCurrent}
                  title={`${t('tracks.renameHint')}${isUnset(track) ? ` · ${t('tracks.unset')}` : ''}`}
                  className={cn(
                    'flex items-center gap-1.5 pl-2.5 py-1 text-xs font-semibold transition-colors',
                    count > 1 ? 'pr-1' : 'pr-2.5',
                    isCurrent ? 'text-txt-main' : 'text-txt-subtle hover:text-txt-main',
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0', color.bg, isUnset(track) && 'opacity-40')} />
                  <span className="max-w-[140px] truncate">{label(track)}</span>
                  {cueCount(track) > 0 && (
                    <span className="text-[11px] font-mono text-txt-dim">{cueCount(track)}</span>
                  )}
                </button>
              )}
              {count > 1 && editing !== track && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleRemove(track)}
                  title={confirming ? t('tracks.removeConfirm', { count: cueCount(track) }) : t('tracks.remove')}
                  aria-label={`${t('tracks.remove')}: ${label(track)}`}
                  className={cn(
                    'mr-1 p-0.5 rounded transition-all disabled:hidden',
                    confirming
                      ? 'bg-red-500/20 text-red-400 opacity-100'
                      : 'text-txt-dim hover:text-red-400 opacity-0 group-hover/tab:opacity-100 focus:opacity-100',
                  )}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          );
        })}
        {count < MAX_TRACKS && (
          <button
            type="button"
            disabled={isProcessing}
            onClick={addTrack}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-txt-subtle hover:text-brand-400 hover:bg-bg-hover transition-colors disabled:opacity-40"
            title={t('tracks.add')}
          >
            <Plus size={14} />
            {count === 1 && <span>{t('tracks.add')}</span>}
          </button>
        )}
      </div>
      {confirmRemove !== null && (
        <span className="text-[11px] text-red-400">{t('tracks.removeConfirm', { count: cueCount(confirmRemove) })}</span>
      )}
      {confirmRemove === null && hint && (
        <span className="flex items-center gap-1.5 text-[11px] text-txt-subtle">
          <Info size={12} className={trackColor(current).text} />
          {hint}
        </span>
      )}
    </div>
  );
};
