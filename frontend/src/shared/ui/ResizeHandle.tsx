import { useRef } from 'react';
import { cn } from '../lib';

interface Props {
  orientation: 'vertical' | 'horizontal';
  /** Called with the pointer travel since the drag started, in px. */
  onResize: (delta: number) => void;
  onResizeStart?: () => void;
  onReset?: () => void;
  label: string;
  className?: string;
}

/**
 * Drag handle between panels. `vertical` resizes widths (drag left/right),
 * `horizontal` resizes heights (drag up/down). Arrow keys nudge by 16 px.
 */
export const ResizeHandle = ({ orientation, onResize, onResizeStart, onReset, label, className }: Props) => {
  const start = useRef(0);
  const vertical = orientation === 'vertical';

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = vertical ? e.clientX : e.clientY;
    onResizeStart?.();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    onResize((vertical ? e.clientX : e.clientY) - start.current);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const keys = vertical ? { less: 'ArrowLeft', more: 'ArrowRight' } : { less: 'ArrowUp', more: 'ArrowDown' };
    if (e.key !== keys.less && e.key !== keys.more) return;
    e.preventDefault();
    onResizeStart?.();
    onResize(e.key === keys.more ? step : -step);
  };

  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      className={cn(
        'group/resize relative shrink-0 flex items-center justify-center touch-none focus-visible:outline-none',
        vertical ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize',
        className,
      )}
    >
      <div
        className={cn(
          'rounded-full bg-border-strong transition-colors group-hover/resize:bg-brand-500 group-focus-visible/resize:bg-brand-500 group-active/resize:bg-brand-500',
          vertical ? 'w-0.5 h-10' : 'h-0.5 w-10',
        )}
      />
    </div>
  );
};
