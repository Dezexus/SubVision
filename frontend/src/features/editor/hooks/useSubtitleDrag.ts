/**
 * Hook to handle subtitle edge dragging for duration adjustments.
 */
import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import type { SubtitleItem } from '../../../types';

export const useSubtitleDrag = (scrollContainerRef: React.RefObject<HTMLDivElement | null>) => {
  const isDraggingRef = useRef(false);
  const dragRef = useRef<{
    subId: number;
    edge: 'start' | 'end';
    startX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  const [draggedEdge, setDraggedEdge] = useState<{ id: number, edge: 'start' | 'end' } | null>(null);

  const handleEdgeMouseMove = useCallback((e: MouseEvent) => {
    if (!dragRef.current || !scrollContainerRef.current) return;

    const state = useAppStore.getState();
    const currentMetadata = state.metadata;
    if (!currentMetadata) return;

    const { subId, edge, startX, initialStart, initialEnd } = dragRef.current;

    const calculatedDuration = currentMetadata.total_frames / currentMetadata.fps;
    const deltaX = e.clientX - startX;
    const containerWidth = scrollContainerRef.current.scrollWidth;
    const deltaTime = (deltaX / containerWidth) * calculatedDuration;

    const currentSub = state.subtitles.find(s => s.id === subId);
    if (!currentSub) return;

    const rawNewTime = edge === 'start' ? initialStart + deltaTime : initialEnd + deltaTime;
    const fps = currentMetadata.fps;
    let targetFrame = Math.round(rawNewTime * fps);

    const updatedSub = { ...currentSub };

    if (edge === 'start') {
        const maxStartFrame = Math.floor((currentSub.end - 0.1) * fps);
        targetFrame = Math.min(Math.max(0, targetFrame), maxStartFrame);
        updatedSub.start = targetFrame / fps;
    } else {
        const minEndFrame = Math.ceil((currentSub.start + 0.1) * fps);
        targetFrame = Math.max(Math.min(currentMetadata.total_frames, targetFrame), minEndFrame);
        updatedSub.end = targetFrame / fps;
    }

    state.updateSubtitle(updatedSub);
  }, [scrollContainerRef]);

  const handleEdgeMouseUp = useCallback(() => {
    dragRef.current = null;
    setDraggedEdge(null);
    document.body.style.cursor = '';

    window.removeEventListener('mousemove', handleEdgeMouseMove);
    window.removeEventListener('mouseup', handleEdgeMouseUp);
    document.removeEventListener('mouseleave', handleEdgeMouseUp);

    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  }, [handleEdgeMouseMove]);

  const handleEdgeMouseDown = (e: React.MouseEvent, sub: SubtitleItem, edge: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();

    isDraggingRef.current = true;
    dragRef.current = {
      subId: sub.id,
      edge,
      startX: e.clientX,
      initialStart: sub.start,
      initialEnd: sub.end
    };

    setDraggedEdge({ id: sub.id, edge });
    document.body.style.cursor = 'col-resize';

    window.addEventListener('mousemove', handleEdgeMouseMove);
    window.addEventListener('mouseup', handleEdgeMouseUp);
    document.addEventListener('mouseleave', handleEdgeMouseUp);
  };

  return {
    isDraggingRef,
    draggedEdge,
    handleEdgeMouseDown
  };
};
