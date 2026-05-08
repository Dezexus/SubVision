import { useState, useEffect, useCallback, useRef } from 'react';

export interface DragState {
  activeId: string | number | null;
  isDragging: boolean;
  isResizing: boolean;
  dragType: 'move' | 'start' | 'end' | null;
}

export const useSubtitleDrag = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  duration: number,
  onUpdate: (id: string | number, type: 'move' | 'start' | 'end', delta: number) => void
) => {
  const [dragState, setDragState] = useState<DragState>({
    activeId: null,
    isDragging: false,
    isResizing: false,
    dragType: null
  });

  const dragMeta = useRef({ startX: 0, activeId: null as string | number | null, dragType: null as 'move' | 'start' | 'end' | null });
  const isDraggingRef = useRef(false);

  useEffect(() => {
    const { isResizing, isDragging } = dragState;
    if (!isResizing && !isDragging) return;

    const style = document.createElement('style');
    const cursor = isResizing ? 'col-resize' : 'grabbing';
    style.innerHTML = `* { cursor: ${cursor} !important; user-select: none !important; }`;
    document.head.appendChild(style);

    return () => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, [dragState.isResizing, dragState.isDragging]);

  const onMouseDown = useCallback((
    e: React.MouseEvent,
    id: string | number,
    type: 'move' | 'start' | 'end'
  ) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    dragMeta.current = { startX: e.clientX, activeId: id, dragType: type };
    setDragState({
      activeId: id,
      isDragging: type === 'move',
      isResizing: type !== 'move',
      dragType: type
    });
  }, []);

  useEffect(() => {
    if (!dragState.activeId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || duration <= 0) return;
      const contentWidth = containerRef.current.scrollWidth;
      const deltaX = e.clientX - dragMeta.current.startX;
      const deltaTime = (deltaX / contentWidth) * duration;

      if (deltaTime !== 0) {
        onUpdate(dragMeta.current.activeId!, dragMeta.current.dragType!, deltaTime);
        dragMeta.current.startX = e.clientX;
      }
    };

    const handleMouseUp = () => {
      setDragState({
        activeId: null,
        isDragging: false,
        isResizing: false,
        dragType: null
      });
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState.activeId, containerRef, duration, onUpdate]);

  return { dragState, onMouseDown, isDraggingRef };
};