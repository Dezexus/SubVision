import React from 'react';
import { cn } from '../../../shared/lib';
import type { ProcessedSubtitle } from '../utils/timelineUtils';

/** Default row height; the timeline scales rows when the user resizes it. */
export const ROW_HEIGHT = 56;
/** Show the cue text once the clip is at least this wide. */
const MIN_TEXT_WIDTH_PX = 40;

interface Props {
  sub: ProcessedSubtitle;
  isActive: boolean;
  isBeingEdited: boolean;
  draggedEdge: { id: number; edge: 'start' | 'end' } | null;
  exactDuration: number;
  /** Width of the whole scrollable timeline in px (viewport × zoom). */
  contentWidth: number;
  rowHeight: number;
  /** Belongs to a track other than the current one. */
  dimmed: boolean;
  onMouseDownEdge: (e: React.MouseEvent, sub: ProcessedSubtitle, edge: 'start' | 'end') => void;
  /** Receives the clip element so the tooltip can anchor above it. */
  onMouseEnter: (el: HTMLElement) => void;
  onMouseLeave: () => void;
}

/** Fill shows confidence (or an edit); the row shows the track. */
function fillClass(sub: ProcessedSubtitle): string {
  if (sub.isEdited) return 'bg-blue-500/25 border-blue-400/50 text-blue-100';
  if (sub.conf > 0.85) return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-100';
  // Dashed as well as red, so low confidence does not rely on color alone.
  if (sub.conf < 0.6) return 'bg-rose-500/25 border-rose-500/60 border-dashed text-rose-100';
  return 'bg-amber-500/20 border-amber-500/40 text-amber-100';
}

/**
 * Renders an individual subtitle block on the timeline track.
 */
export const SubtitleClip = ({
  sub,
  isActive,
  isBeingEdited,
  draggedEdge,
  exactDuration,
  contentWidth,
  rowHeight,
  dimmed,
  onMouseDownEdge,
  onMouseEnter,
  onMouseLeave,
}: Props) => {
  const startPercent = (sub.start / exactDuration) * 100;
  const durationPercent = ((sub.end - sub.start) / exactDuration) * 100;
  const widthPx = (durationPercent / 100) * contentWidth;
  const clipHeight = Math.round(rowHeight * 0.75);

  const isDraggedStart = draggedEdge?.id === sub.id && draggedEdge.edge === 'start';
  const isDraggedEnd = draggedEdge?.id === sub.id && draggedEdge.edge === 'end';

  return (
    <div
      className="absolute group/sub pointer-events-auto"
      style={{
        left: `${startPercent}%`,
        width: `${Math.max(durationPercent, 0.1)}%`,
        top: sub.lane * rowHeight + (rowHeight - clipHeight) / 2,
        height: clipHeight,
      }}
      onMouseEnter={(e) => onMouseEnter(e.currentTarget)}
      onMouseLeave={onMouseLeave}
    >
      <div className={cn(
        'w-full h-full rounded-[5px] border overflow-hidden flex items-center px-2.5 py-1 text-xs leading-snug transition-[opacity,filter] duration-150 relative',
        fillClass(sub),
        dimmed ? 'opacity-45 hover:opacity-80' : 'opacity-90 hover:opacity-100',
        sub.hasOverlap && 'outline outline-1 outline-red-500/70',
        isActive && 'brightness-125 ring-1 ring-white/40',
        isBeingEdited && 'ring-2 ring-brand-500 animate-pulse z-20',
      )}>
        {widthPx >= MIN_TEXT_WIDTH_PX && (
          <span className={cn('min-w-0 break-words', clipHeight >= 40 ? 'line-clamp-2' : 'line-clamp-1')}>{sub.text}</span>
        )}

        <div
          className={cn(
            'absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/50 transition-colors z-10',
            isDraggedStart && 'bg-yellow-400/80',
          )}
          onMouseDown={(e) => onMouseDownEdge(e, sub, 'start')}
        />
        <div
          className={cn(
            'absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-white/50 transition-colors z-10',
            isDraggedEnd && 'bg-yellow-400/80',
          )}
          onMouseDown={(e) => onMouseDownEdge(e, sub, 'end')}
        />
      </div>
    </div>
  );
};
