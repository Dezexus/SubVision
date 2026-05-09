import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Unlock } from 'lucide-react';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import { SubtitleCard } from './SubtitleCard';

export const SubtitleList = () => {
  const subtitles = useProcessingStore((s) => s.subtitles);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const metadata = useVideoStore((s) => s.metadata);
  const parentRef = useRef<HTMLDivElement>(null);
  const lastActiveIndexRef = useRef<number>(-1);

  const [autoScroll, setAutoScroll] = useState(true);

  const rowVirtualizer = useVirtualizer({
    count: subtitles.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 110,
    overscan: 10,
  });

  useEffect(() => {
    if (isProcessing && subtitles.length > 0) {
      rowVirtualizer.scrollToIndex(subtitles.length - 1, { align: 'end' });
    }
  }, [subtitles.length, rowVirtualizer, isProcessing]);

  useEffect(() => {
    if (isProcessing || !metadata || subtitles.length === 0 || !autoScroll) return;
    const time = currentFrameIndex / metadata.fps;
    const activeIndex = subtitles.findIndex(s => time >= s.start && time <= s.end);
    if (activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = activeIndex;
      rowVirtualizer.scrollToIndex(activeIndex, { align: 'center' });
    } else if (activeIndex === -1) {
      lastActiveIndexRef.current = -1;
    }
  }, [currentFrameIndex, metadata, subtitles, isProcessing, rowVirtualizer, autoScroll]);

  const handleUserScroll = useCallback(() => {
    if (autoScroll && !isProcessing) {
      setAutoScroll(false);
    }
  }, [autoScroll, isProcessing]);

  if (subtitles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-txt-subtle text-xs italic">
        Waiting for results...
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={parentRef}
        className="h-full w-full overflow-y-auto scrollbar-hide pb-4"
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
                <SubtitleCard item={sub} index={virtualRow.index} />
              </div>
            );
          })}
        </div>
      </div>
      {!autoScroll && !isProcessing && (
        <button
          onClick={() => setAutoScroll(true)}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-bg-surface border border-border-strong text-txt-muted hover:text-white hover:bg-bg-hover px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-[10px] font-bold uppercase transition-all z-10"
          title="Resume auto-scroll"
        >
          <Unlock size={12} />
          Follow Video
        </button>
      )}
    </div>
  );
};