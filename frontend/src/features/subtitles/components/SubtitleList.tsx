/**
 * Renders a virtualized list of subtitle cards that auto-scrolls with the active video frame.
 */
import { useRef, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Unlock, FileText } from 'lucide-react';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import { cn, countTracks, trackColor, trackOf, useGlobalKeydown } from '../../../shared/lib';
import { useTrackLabel } from '../../../hooks/useTrackLabel';
import { useTranslation } from '../../../i18n';
import { SubtitleCard } from './SubtitleCard';

export const SubtitleList = () => {
  const { t } = useTranslation();
  const allSubtitles = useProcessingStore((s) => s.subtitles);
  const regionCount = useVideoStore((s) => s.rois.length);
  const activeTrack = useVideoStore((s) => s.activeTrack);
  const label = useTrackLabel();
  // By default the list follows the current track; "All" shows every track.
  const [showAll, setShowAll] = useState(false);

  const trackCount = countTracks(regionCount, allSubtitles);
  const filterTrack = trackCount > 1 && !showAll ? Math.min(activeTrack, trackCount - 1) : null;
  const subtitles = useMemo(
    () => (filterTrack === null ? allSubtitles : allSubtitles.filter((s) => trackOf(s) === filterTrack)),
    [allSubtitles, filterTrack],
  );
  // Last cue of each track: it has nothing to merge with.
  const lastIdByTrack = useMemo(() => {
    const last = new Map<number, number>();
    for (const s of allSubtitles) last.set(trackOf(s), s.id);
    return last;
  }, [allSubtitles]);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const metadata = useVideoStore((s) => s.metadata);

  const parentRef = useRef<HTMLDivElement>(null);
  const lastActiveIndexRef = useRef<number>(-1);
  const hoveredIdRef = useRef<number | null>(null);

  const [autoScroll, setAutoScroll] = useState(true);

  const time = metadata ? currentFrameIndex / metadata.fps : -1;
  const activeIndex = metadata
    ? subtitles.findIndex((s) => time >= s.start && time <= s.end)
    : -1;

  // TanStack Virtual intentionally returns functions that React Compiler cannot memoize.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: subtitles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 115,
    overscan: 10,
  });

  useEffect(() => {
    if (isProcessing && subtitles.length > 0) {
      rowVirtualizer.scrollToIndex(subtitles.length - 1, { align: 'end' });
    }
  }, [subtitles.length, rowVirtualizer, isProcessing]);

  useEffect(() => {
    if (isProcessing || !autoScroll) return;
    if (activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current) {
      rowVirtualizer.scrollToIndex(activeIndex, { align: 'center' });
    }
    lastActiveIndexRef.current = activeIndex;
  }, [activeIndex, isProcessing, rowVirtualizer, autoScroll]);

  const handleUserScroll = useCallback(() => {
    if (autoScroll && !isProcessing) {
      setAutoScroll(false);
    }
  }, [autoScroll, isProcessing]);

  const handleHoverChange = useCallback((id: number | null) => {
    hoveredIdRef.current = id;
  }, []);

  // One listener for the whole list. Backspace is not bound: it fired too easily
  // while the pointer merely rested over a card.
  useGlobalKeydown((e) => {
    const id = hoveredIdRef.current;
    if (id === null || e.key !== 'Delete') return;
    e.preventDefault();
    hoveredIdRef.current = null;
    useProcessingStore.getState().deleteSubtitle(id);
  });

  const current = Math.min(activeTrack, trackCount - 1);
  const segment = (active: boolean, onClick: () => void, children: ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors min-w-0',
        active ? 'bg-bg-surface text-txt-main shadow-sm' : 'text-txt-subtle hover:text-txt-main',
      )}
    >
      {children}
    </button>
  );
  const tabs = trackCount > 1 && (
    <div className="px-2 pb-2">
      <div className="flex items-center gap-1 bg-bg-input border border-border-main rounded-lg p-0.5">
        {segment(!showAll, () => setShowAll(false), (
          <>
            <span className={cn('w-2 h-2 rounded-full shrink-0', trackColor(current).bg)} />
            <span className="text-txt-dim">{t('tracks.current')}:</span>
            <span className="truncate">{label(current)}</span>
          </>
        ))}
        {segment(showAll, () => setShowAll(true), t('tracks.all'))}
      </div>
    </div>
  );

  if (allSubtitles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-2xl bg-bg-surface border border-border-strong flex items-center justify-center mb-4 shadow-sm">
          <FileText size={28} className="text-txt-dim" />
        </div>
        <h3 className="text-sm font-bold text-txt-main mb-1 tracking-wide">{t('subtitles.emptyTitle')}</h3>
        <p className="text-xs text-txt-subtle max-w-[220px] leading-relaxed">
          {t('subtitles.emptyHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full flex flex-col">
      {tabs}
      <div
        ref={parentRef}
        className="flex-1 min-h-0 w-full overflow-y-auto scrollbar-hide pb-16"
        onWheel={handleUserScroll}
        onTouchMove={handleUserScroll}
      >
        <div
          className="w-full relative"
          style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const sub = subtitles[virtualRow.index];
            return (
              <div
                key={sub.id}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute top-0 left-0 w-full px-2 pb-3"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <SubtitleCard
                  item={sub}
                  index={virtualRow.index}
                  isActive={time >= sub.start && time <= sub.end}
                  hasNext={lastIdByTrack.get(trackOf(sub)) !== sub.id}
                  showTrack={trackCount > 1 && showAll}
                  onHoverChange={handleHoverChange}
                />
              </div>
            );
          })}
        </div>
      </div>

      {!autoScroll && !isProcessing && (
        <button
          onClick={() => setAutoScroll(true)}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-bg-panel/80 backdrop-blur-md border border-border-strong text-txt-muted hover:text-txt-main hover:border-brand-500/50 px-4 py-2 rounded-full shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider transition-all z-10 animate-in fade-in slide-in-from-bottom-2"
          title={t('subtitles.followVideoTitle')}
        >
          <Unlock size={14} className="text-brand-500" />
          {t('subtitles.followVideo')}
        </button>
      )}
    </div>
  );
};
