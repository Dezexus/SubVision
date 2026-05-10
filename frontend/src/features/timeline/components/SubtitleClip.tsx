import React from 'react';
import { cn } from '../../../utils/cn';
import type { ProcessedSubtitle } from '../utils/timelineUtils';

interface Props {
  sub: ProcessedSubtitle;
  isActive: boolean;
  isBeingEdited: boolean;
  zoomLevel: number;
  draggedEdge: { id: number; edge: 'start' | 'end' } | null;
  exactDuration: number;
  onMouseDownEdge: (e: React.MouseEvent, sub: ProcessedSubtitle, edge: 'start' | 'end') => void;
  onMouseEnter: () => void;
}

export const SubtitleClip = ({
  sub,
  isActive,
  isBeingEdited,
  zoomLevel,
  draggedEdge,
  exactDuration,
  onMouseDownEdge,
  onMouseEnter,
}: Props) => {
  const startPercent = (sub.start / exactDuration) * 100;
  const durationPercent = ((sub.end - sub.start) / exactDuration) * 100;
  
  const isDraggedStart = draggedEdge?.id === sub.id && draggedEdge.edge === 'start';
  const isDraggedEnd = draggedEdge?.id === sub.id && draggedEdge.edge === 'end';

  let colorClass = "bg-bg-surface border-border-strong";
  if (sub.isEdited) colorClass = "bg-blue-500/20 border-blue-500/40 text-blue-200";
  else if (sub.conf > 0.85) colorClass = "bg-emerald-500/20 border-emerald-500/40 text-emerald-200";
  else if (sub.conf < 0.6) colorClass = "bg-rose-500/20 border-rose-500/40 text-rose-200";
  else colorClass = "bg-amber-500/20 border-amber-500/40 text-amber-200";

  if (isActive) colorClass += " ring-1 ring-white/30 brightness-125";
  if (isBeingEdited) colorClass += " ring-2 ring-brand-500 animate-pulse z-20";

  return (
    <div
      className="absolute h-6 group/sub pointer-events-auto"
      style={{
        left: `${startPercent}%`,
        width: `${Math.max(durationPercent, 0.1)}%`,
        top: `${sub.track * 28}px`,
      }}
      onMouseEnter={onMouseEnter}
    >
      <div className={cn(
        "w-full h-full rounded-sm border transition-all duration-150 backdrop-blur-sm truncate px-1 text-[9px] font-mono leading-6 opacity-80 hover:opacity-100 relative",
        colorClass
      )}>
        {zoomLevel > 3 && sub.text}

        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/50 transition-colors z-10",
            isDraggedStart ? "bg-yellow-400/80" : ""
          )}
          onMouseDown={(e) => onMouseDownEdge(e, sub, 'start')}
        />
        <div
          className={cn(
            "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/50 transition-colors z-10",
            isDraggedEnd ? "bg-yellow-400/80" : ""
          )}
          onMouseDown={(e) => onMouseDownEdge(e, sub, 'end')}
        />
      </div>
    </div>
  );
};