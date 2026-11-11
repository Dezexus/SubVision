import React from 'react';
import { cn } from '../../../shared/lib';
import { formatDuration, type ProcessedSubtitle } from '../utils/timelineUtils';
import { useTranslation } from '../../../i18n';

/** Default row height; the timeline scales rows when the user resizes it. */
export const ROW_HEIGHT = 56;
/** Show the cue text once the clip is at least this wide. */
const MIN_TEXT_WIDTH_PX = 40;
/** Show the cue length inside the clip once it is this wide. */
const MIN_DURATION_LABEL_PX = 96;
/** Space left between neighbouring cues so each block reads at its own length. */
const GAP_PX = 1;
/** Very short cues stay visible (and grabbable) at this width. */
const MIN_CLIP_PX = 3;

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
  const { t } = useTranslation();
  const duration = Math.max(0, sub.end - sub.start);
  // Whole pixels from the exact times: the left edge is where the cue starts,
  // the width is its real length minus a 1px gap to the next cue.
  const measured = contentWidth > 0;
  const leftPx = Math.round((sub.start / exactDuration) * contentWidth);
  const rightPx = Math.round((sub.end / exactDuration) * contentWidth);
  const widthPx = Math.max(MIN_CLIP_PX, rightPx - leftPx - GAP_PX);
  const clipHeight = Math.round(rowHeight * 0.75);
  const durationLabel = t('timeline.seconds', { v: formatDuration(duration) });

  const isDraggedStart = draggedEdge?.id === sub.id && draggedEdge.edge === 'start';
  const isDraggedEnd = draggedEdge?.id === sub.id && draggedEdge.edge === 'end';

  return (
    <div
      className="absolute group/sub pointer-events-auto"
      style={{
        ...(measured
          ? { left: leftPx, width: widthPx }
          : { left: `${(sub.start / exactDuration) * 100}%`, width: `${Math.max((duration / exactDuration) * 100, 0.1)}%` }),
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
          <span className={cn('flex-1 min-w-0 break-words', clipHeight >= 40 ? 'line-clamp-2' : 'line-clamp-1')}>{sub.text}</span>
        )}
        {widthPx >= MIN_DURATION_LABEL_PX && (
          <span className="shrink-0 self-end ml-2 text-[10px] font-mono opacity-60">{durationLabel}</span>
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
