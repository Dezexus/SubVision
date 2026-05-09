import { useState, useEffect, useRef, useCallback } from 'react';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import type { SubtitleItem } from '../../../types';

export const useSubtitleDrag = (
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
) => {
  const isDraggingRef = useRef(false);
  const [draggedEdge, setDraggedEdge] = useState<{ id: number; edge: 'start' | 'end' } | null>(null);

  const dragStartRef = useRef<{
    startX: number;
    originalSub: SubtitleItem;
  } | null>(null);

  const handleEdgeMouseDown = useCallback(
    (e: React.MouseEvent, sub: SubtitleItem, edge: 'start' | 'end') => {
      e.preventDefault();
      e.stopPropagation();

      isDraggingRef.current = true;
      setDraggedEdge({ id: sub.id, edge });
      dragStartRef.current = {
        startX: e.clientX,
        originalSub: { ...sub }
      };
    },
    []
  );

  useEffect(() => {
    if (!draggedEdge) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current || !scrollContainerRef.current) return;

      const metadata = useVideoStore.getState().metadata;
      if (!metadata) return;

      const duration = metadata.total_frames / metadata.fps;
      const containerWidth = scrollContainerRef.current.scrollWidth;

      const deltaX = e.clientX - dragStartRef.current.startX;
      const deltaSec = (deltaX / containerWidth) * duration;

      const { originalSub } = dragStartRef.current;
      const newSub = { ...originalSub };

      if (draggedEdge.edge === 'start') {
        newSub.start = Math.max(0, Math.min(originalSub.start + deltaSec, newSub.end - 0.1));
      } else {
        newSub.end = Math.max(newSub.start + 0.1, Math.min(originalSub.end + deltaSec, duration));
      }

      useProcessingStore.getState().updateSubtitle(newSub);
    };

    const handleMouseUp = () => {
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 0);
      setDraggedEdge(null);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    const style = document.createElement('style');
    style.innerHTML = `* { cursor: col-resize !important; user-select: none !important; }`;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    };
  }, [draggedEdge, scrollContainerRef]);

  return { isDraggingRef, draggedEdge, handleEdgeMouseDown };
};