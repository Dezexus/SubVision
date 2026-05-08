import { useState, useEffect, useCallback } from 'react';

export interface DragState {
  activeId: string | number | null;
  isDragging: boolean;
  isResizing: boolean;
  dragType: 'move' | 'start' | 'end' | null;
  startX: number;
}

/**
 * Custom hook to manage subtitle dragging and resizing events.
 * Safely handles global DOM cursor states and prevents text selection during drag.
 */
export const useSubtitleDrag = (
  containerRef: React.RefObject<HTMLDivElement>,
  duration: number,
  onUpdate: (id: string | number, type: 'move' | 'start' | 'end', delta: number) => void
) => {
  const [dragState, setDragState] = useState<DragState>({
    activeId: null,
    isDragging: false,
    isResizing: false,
    dragType: null,
    startX: 0
  });

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
    setDragState({
      activeId: id,
      isDragging: type === 'move',
      isResizing: type !== 'move',
      dragType: type,
      startX: e.clientX
    });
  }, []);

  useEffect(() => {
    if (!dragState.activeId) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current || duration <= 0) return;
      const containerWidth = containerRef.current.getBoundingClientRect().width;
      const deltaX = e.clientX - dragState.startX;
      const deltaTime = (deltaX / containerWidth) * duration;
      
      onUpdate(dragState.activeId, dragState.dragType!, deltaTime);
    };

    const handleMouseUp = () => {
      setDragState(prev => ({ 
        ...prev, 
        activeId: null, 
        isDragging: false, 
        isResizing: false, 
        dragType: null 
      }));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, containerRef, duration, onUpdate]);

  return { dragState, onMouseDown };
};