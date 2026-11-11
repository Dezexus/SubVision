import { useState, useRef, useLayoutEffect, useCallback, useEffect } from 'react';

const MIN_ZOOM = 1;
/** High enough to see sub-second cues of a long video. */
const MAX_ZOOM = 60;
const BUTTON_FACTOR = 1.5;
const WHEEL_FACTOR = 1.15;

/**
 * Multiplicative zoom anchored at a point: each step scales by the same
 * factor, so getting from 1× to 60× takes a few steps, not a hundred.
 */
export const useTimelineZoom = (scrollContainerRef: React.RefObject<HTMLDivElement | null>) => {
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomAnchorRef = useRef<{ newScrollLeft: number } | null>(null);

  useLayoutEffect(() => {
    if (zoomAnchorRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = zoomAnchorRef.current.newScrollLeft;
      zoomAnchorRef.current = null;
    }
  }, [zoomLevel, scrollContainerRef]);

  const applyAnchorZoom = useCallback((factor: number, anchorX: number) => {
    if (!scrollContainerRef.current) return;
    const scrollLeft = scrollContainerRef.current.scrollLeft;

    setZoomLevel(prev => {
      const newZoom = Math.min(Math.max(MIN_ZOOM, prev * factor), MAX_ZOOM);
      if (newZoom !== prev) {
        const absoluteAnchorX = scrollLeft + anchorX;
        zoomAnchorRef.current = {
          newScrollLeft: absoluteAnchorX * (newZoom / prev) - anchorX,
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
        applyAnchorZoom(e.deltaY > 0 ? 1 / WHEEL_FACTOR : WHEEL_FACTOR, e.clientX - rect.left);
      } else if (e.shiftKey) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, [applyAnchorZoom, scrollContainerRef]);

  /** `direction` > 0 zooms in, < 0 zooms out, around the view center. */
  const handleZoomButton = (direction: number) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    applyAnchorZoom(direction > 0 ? BUTTON_FACTOR : 1 / BUTTON_FACTOR, rect.width / 2);
  };

  const resetZoom = () => setZoomLevel(1);

  return {
    zoomLevel,
    applyAnchorZoom,
    handleZoomButton,
    resetZoom
  };
};
