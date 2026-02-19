/**
 * Timeline component with unified frame-to-pixel math and phantom-click prevention.
 */
import React, { useState, useMemo, useRef, useLayoutEffect, useCallback, useEffect } from 'react';
import {
  ChevronLeft, ChevronRight,
  Clock, ZoomIn, ZoomOut
} from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { formatTimeDisplay } from '../../../utils/format';
import type { SubtitleItem } from '../../../types';

type ProcessedSubtitle = SubtitleItem & { track: number };

export const HybridTimeline = () => {
  const {
    metadata,
    subtitles,
    currentFrameIndex,
    setCurrentFrame,
  } = useAppStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<{ newScrollLeft: number } | null>(null);
  const dragRef = useRef<{
    subId: number;
    edge: 'start' | 'end';
    startX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  const isDraggingRef = useRef(false);

  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredSub, setHoveredSub] = useState<ProcessedSubtitle | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);
  const [draggedEdge, setDraggedEdge] = useState<{ id: number, edge: 'start' | 'end' } | null>(null);

  const { currentTime, totalTime, exactDuration } = useMemo(() => {
    if (!metadata) return { currentTime: "00:00:00.00", totalTime: "00:00:00.00", exactDuration: 1 };
    const calculatedDuration = metadata.total_frames / metadata.fps;
    return {
      currentTime: formatTimeDisplay(currentFrameIndex / metadata.fps),
      totalTime: formatTimeDisplay(calculatedDuration),
      exactDuration: calculatedDuration
    };
  }, [metadata, currentFrameIndex]);

  const processedSubtitles = useMemo((): ProcessedSubtitle[] => {
    const sortedSubs = [...subtitles].sort((a, b) => a.start - b.start);
    const lanes: number[] = [];
    return sortedSubs.map(sub => {
      let assignedTrack = lanes.findIndex(laneEndTime => laneEndTime <= sub.start);
      if (assignedTrack === -1) {
        assignedTrack = lanes.length;
      }
      lanes[assignedTrack] = sub.end;
      return { ...sub, track: assignedTrack };
    });
  }, [subtitles]);

  useLayoutEffect(() => {
    if (zoomAnchorRef.current !== null && scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = zoomAnchorRef.current.newScrollLeft;
      zoomAnchorRef.current = null;
    }
  }, [zoomLevel]);

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
  }, []);

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
  }, [applyAnchorZoom]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === '=' || e.key === '+' || e.key === '-')) {
        e.preventDefault();
        const delta = e.key === '-' ? -0.5 : 0.5;
        if (scrollContainerRef.current) {
          const rect = scrollContainerRef.current.getBoundingClientRect();
          applyAnchorZoom(delta, rect.width / 2);
        }
      } else if (e.ctrlKey && e.key === '0') {
        e.preventDefault();
        setZoomLevel(1);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [applyAnchorZoom]);

  const handleZoomButton = (delta: number) => {
    if (!scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    applyAnchorZoom(delta, rect.width / 2);
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current) return;
    if (!metadata || !scrollContainerRef.current) return;

    const rect = scrollContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollLeft = scrollContainerRef.current.scrollLeft;

    const contentX = clickX + scrollLeft;
    const containerWidth = scrollContainerRef.current.scrollWidth;

    const percent = contentX / containerWidth;
    const targetFrame = Math.round(percent * metadata.total_frames);

    setCurrentFrame(Math.min(Math.max(0, targetFrame), metadata.total_frames - 1));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setHoverPos(e.clientX - rect.left);
  };

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
  }, []);

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

  if (!metadata) return null;

  const progressPercent = (currentFrameIndex / metadata.total_frames) * 100;

  return (
    <div className="bg-[#1e1e1e] border border-[#333333] shadow-2xl select-none flex flex-col rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333333]">
        <div className="flex items-center gap-3 w-40">
            <div className="p-1.5 bg-[#333333] rounded-md text-[#007acc]">
                <Clock size={14} />
            </div>
            <div className="flex flex-col">
                <span className="text-sm font-mono font-bold text-white leading-none tracking-wide">
                    {currentTime}
                </span>
                <span className="text-[9px] text-[#858585] font-mono mt-0.5">
                    FRAME: <span className="text-[#C5C5C5]">{currentFrameIndex}</span>
                </span>
            </div>
        </div>

        <div className="flex items-center gap-1 bg-[#1e1e1e] p-1 rounded-lg border border-[#333333]">
            <button onClick={() => setCurrentFrame(f => Math.max(0, f - 1))} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Prev Frame">
                <ChevronLeft size={16} />
            </button>
            <div className="flex items-center px-2 gap-1 border-l border-[#333333] ml-1 pl-2">
                <button onClick={() => handleZoomButton(-0.5)} className="p-1 text-[#858585] hover:text-white"><ZoomOut size={14}/></button>
                <span className="text-[10px] font-mono w-8 text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => handleZoomButton(0.5)} className="p-1 text-[#858585] hover:text-white"><ZoomIn size={14}/></button>
            </div>
            <button onClick={() => setCurrentFrame(f => Math.min(metadata.total_frames - 1, f + 1))} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Next Frame">
                <ChevronRight size={16} />
            </button>
        </div>

        <div className="flex flex-col items-end w-32 opacity-60">
             <span className="text-xs font-mono text-[#858585] font-medium">{totalTime}</span>
        </div>
      </div>

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredSub(null)}
        className="relative h-28 bg-[#18181b] w-full group overflow-hidden"
      >
          <div
            ref={scrollContainerRef}
            className="w-full h-full overflow-x-auto overflow-y-hidden custom-scrollbar relative"
            onClick={handleTimelineClick}
          >
              <div
                className="h-full relative transition-all duration-75 ease-out"
                style={{ width: `${zoomLevel * 100}%` }}
              >
                  <div className="absolute top-0 w-full h-4 border-b border-[#333333] flex justify-between px-[2px] opacity-50">
                     {Array.from({ length: 20 * Math.ceil(zoomLevel) }).map((_, i) => (
                         <div key={i} className={cn("w-px bg-[#333333]", i % 10 === 0 ? "h-2 mt-1" : "h-1 mt-2")} />
                     ))}
                  </div>

                  <div className="absolute top-6 w-full h-full pointer-events-none">
                    {processedSubtitles.map((sub) => {
                      const startPercent = (sub.start / exactDuration) * 100;
                      const durationPercent = ((sub.end - sub.start) / exactDuration) * 100;
                      const isActive = (currentFrameIndex / metadata.fps) >= sub.start && (currentFrameIndex / metadata.fps) <= sub.end;
                      const isDraggedStart = draggedEdge?.id === sub.id && draggedEdge.edge === 'start';
                      const isDraggedEnd = draggedEdge?.id === sub.id && draggedEdge.edge === 'end';

                      let colorClass = "bg-[#333333] border-[#454545]";
                      if (sub.isEdited) colorClass = "bg-blue-500/20 border-blue-500/40 text-blue-200";
                      else if (sub.conf > 0.85) colorClass = "bg-emerald-500/20 border-emerald-500/40 text-emerald-200";
                      else if (sub.conf < 0.6) colorClass = "bg-rose-500/20 border-rose-500/40 text-rose-200";
                      else colorClass = "bg-amber-500/20 border-amber-500/40 text-amber-200";

                      if (isActive) colorClass += " ring-1 ring-white/30 brightness-125";

                      return (
                        <div
                          key={sub.id}
                          className="absolute h-6 group/sub pointer-events-auto"
                          style={{
                            left: `${startPercent}%`,
                            width: `${Math.max(durationPercent, 0.1)}%`,
                            top: `${sub.track * 28}px`,
                          }}
                          onMouseEnter={() => setHoveredSub(sub)}
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
                                    onMouseDown={(e) => handleEdgeMouseDown(e, sub, 'start')}
                                />
                                <div
                                    className={cn(
                                        "absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/50 transition-colors z-10",
                                        isDraggedEnd ? "bg-yellow-400/80" : ""
                                    )}
                                    onMouseDown={(e) => handleEdgeMouseDown(e, sub, 'end')}
                                />
                            </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="absolute top-0 bottom-0 z-10 w-px pointer-events-none transition-all duration-75 ease-linear will-change-left"
                    style={{ left: `${progressPercent}%` }}
                  >
                      <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] bg-red-500 rounded-full shadow-md border-[2px] border-[#18181b]" />
                      <div className="absolute top-1.5 h-full w-[1.5px] -left-[0.75px] bg-red-500/80 rounded-full" />
                  </div>
              </div>
          </div>

          {hoveredSub && (
            <div
                className="absolute z-50 bottom-2 pointer-events-none"
                style={{ left: Math.min(Math.max(hoverPos, 100), containerRef.current ? containerRef.current.clientWidth - 100 : 0) }}
            >
                <div className="bg-[#1e1e1e]/95 backdrop-blur border border-[#333333] p-2 rounded shadow-2xl text-xs -translate-x-1/2 w-48">
                    <div className="flex justify-between text-[#858585] mb-1 font-mono text-[9px] uppercase">
                        <span>{formatTimeDisplay(hoveredSub.start)}</span>
                        <span className={cn(hoveredSub.conf > 0.8 ? "text-emerald-400" : "text-amber-400")}>
                            {Math.round(hoveredSub.conf * 100)}%
                        </span>
                    </div>
                    <p className="text-[#F0F0F0] line-clamp-2">
                        {hoveredSub.text}
                    </p>
                </div>
            </div>
          )}
      </div>
    </div>
  );
};
