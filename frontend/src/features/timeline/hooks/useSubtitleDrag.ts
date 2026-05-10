import { useState, useRef, useEffect } from 'react';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import type { ProcessedSubtitle } from '../utils/timelineUtils';

interface DraggedEdge {
  id: number;
  edge: 'start' | 'end';
}

export const useSubtitleDrag = (
  scrollContainerRef: React.RefObject<HTMLDivElement>,
  isSnappingEnabled: boolean = true
) => {
  const [draggedEdge, setDraggedEdge] = useState<DraggedEdge | null>(null);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    if (!draggedEdge) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!scrollContainerRef.current) return;
      const { metadata, currentFrameIndex } = useVideoStore.getState();
      if (!metadata) return;

      const rect = scrollContainerRef.current.getBoundingClientRect();
      const containerWidth = scrollContainerRef.current.scrollWidth;
      const clickX = e.clientX - rect.left + scrollContainerRef.current.scrollLeft;
      const percent = clickX / containerWidth;
      const duration = metadata.total_frames / metadata.fps;
      let newTime = Math.max(0, Math.min(duration, percent * duration));

      const store = useProcessingStore.getState();
      const subtitles = store.subtitles;

      if (isSnappingEnabled) {
        const snapThreshold = 4 / metadata.fps;
        const playheadTime = currentFrameIndex / metadata.fps;
        let snapTarget = newTime;
        let minDiff = snapThreshold;

        if (Math.abs(newTime - playheadTime) < minDiff) {
          snapTarget = playheadTime;
          minDiff = Math.abs(newTime - playheadTime);
        }

        subtitles.forEach((s) => {
          if (s.id === draggedEdge.id) return;
          if (Math.abs(newTime - s.start) < minDiff) {
            snapTarget = s.start;
            minDiff = Math.abs(newTime - s.start);
          }
          if (Math.abs(newTime - s.end) < minDiff) {
            snapTarget = s.end;
            minDiff = Math.abs(newTime - s.end);
          }
        });
        newTime = snapTarget;
      }

      const sub = subtitles.find((s) => s.id === draggedEdge.id);
      if (sub) {
        if (draggedEdge.edge === 'start') {
          store.updateSubtitle({ ...sub, start: Math.min(newTime, sub.end - 0.05) });
        } else {
          store.updateSubtitle({ ...sub, end: Math.max(newTime, sub.start + 0.05) });
        }
      }
    };

    const handleMouseUp = () => {
      setDraggedEdge(null);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedEdge, scrollContainerRef, isSnappingEnabled]);

  const handleEdgeMouseDown = (e: React.MouseEvent, sub: ProcessedSubtitle, edge: 'start' | 'end') => {
    e.stopPropagation();
    setDraggedEdge({ id: sub.id, edge });
    isDraggingRef.current = true;
  };

  return { isDraggingRef, draggedEdge, handleEdgeMouseDown };
};