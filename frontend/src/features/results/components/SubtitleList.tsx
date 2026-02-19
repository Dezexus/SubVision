/**
 * Virtualized list component for rendering large arrays of subtitles efficiently.
 */
import React, { useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAppStore } from '../../../store/useAppStore';
import { SubtitleCard } from './SubtitleCard';

export const SubtitleList = () => {
  const { subtitles } = useAppStore();
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: subtitles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 110,
    overscan: 10,
  });

  useEffect(() => {
    if (subtitles.length > 0) {
      rowVirtualizer.scrollToIndex(subtitles.length - 1, { align: 'end', behavior: 'smooth' });
    }
  }, [subtitles.length, rowVirtualizer]);

  if (subtitles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[#555] text-xs italic">
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
