/**
 * Virtualized list component for rendering large arrays of subtitles efficiently.
 * Auto-scrolls to the newly added subtitle during processing, or to the active subtitle during playback.
 */
import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../../../store/useAppStore';
import { SubtitleCard } from './SubtitleCard';

export const SubtitleList = () => {
  const { subtitles, isProcessing } = useAppStore();
  const parentRef = useRef<HTMLDivElement>(null);
  const lastActiveIndexRef = useRef<number>(-1);

  const rowVirtualizer = useVirtualizer({
    count: subtitles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 110,
    overscan: 10,
  });

  useEffect(() => {
    if (isProcessing && subtitles.length > 0) {
      rowVirtualizer.scrollToIndex(subtitles.length - 1, { align: 'end', behavior: 'smooth' });
    }
  }, [subtitles.length, rowVirtualizer, isProcessing]);

  useEffect(() => {
    const unsub = useAppStore.subscribe((state) => {
      if (state.isProcessing || !state.metadata || state.subtitles.length === 0) return;

      const time = state.currentFrameIndex / state.metadata.fps;
      const activeIndex = state.subtitles.findIndex(s => time >= s.start && time <= s.end);

      if (activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current) {
        lastActiveIndexRef.current = activeIndex;
        rowVirtualizer.scrollToIndex(activeIndex, { align: 'center', behavior: 'smooth' });
      } else if (activeIndex === -1) {
        lastActiveIndexRef.current = -1;
      }
    });
    return unsub;
  }, [rowVirtualizer]);

  if (subtitles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-txt-subtle text-xs italic">
        Waiting for results...
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="h-full w-full overflow-y-auto scrollbar-hide pb-4"
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
              <SubtitleCard item={sub} index={virtualRow.index} />
            </div>
          );
        })}
      </div>
    </div>
  );
};
