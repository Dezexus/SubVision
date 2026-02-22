/**
 * Hook to handle timeline zooming logic including scroll anchoring.
 */
import { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';

export const useTimelineZoom = (scrollContainerRef: React.RefObject<HTMLDivElement | null>) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomAnchorRef = useRef<{ newScrollLeft: number } | null>(null);

  useLayoutEffect(() => {
    if (zoomAnchorRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = zoomAnchorRef.current.newScrollLeft;
      zoomAnchorRef.current = null;
    }
  }, [zoomLevel, scrollContainerRef]);

  const applyAnchorZoom = useCallback((delta: number, anchorX: number) => {
    if (!scrollContainerRef.current) return;
    const scrollLeft = scrollContainerRef.current.scrollLeft;

    setZoomLevel(prev => {
      const newZoom = Math.min(Math.max(1, prev + delta), 20);
      if (newZoom !== prev) {
        const zoomRatio = newZoom / prev;
        const absoluteAnchorX = scrollLeft + anchorX;
        const newAbsoluteAnchorX = absoluteAnchorX * zoomRatio;
        zoomAnchorRef.current = {
          newScrollLeft: newAbsoluteAnchorX - anchorX
        };
      }
      return newZoom;
    });
  }, [scrollContainerRef]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const delta = e.deltaY > 0 ? -0.2 : 0.2;
        applyAnchorZoom(delta, mouseX);
      } else if (e.shiftKey) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [applyAnchorZoom, scrollContainerRef]);

  const handleZoomButton = (delta: number) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    applyAnchorZoom(delta, rect.width / 2);
  };

  const resetZoom = () => setZoomLevel(1);

  return {
    zoomLevel,
    applyAnchorZoom,
    handleZoomButton,
    resetZoom
  };
};
