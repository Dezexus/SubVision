import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight,
  SkipBack, SkipForward,
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

  const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100% width
  const [hoveredSub, setHoveredSub] = useState<ProcessedSubtitle | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);

  // Time & Duration
  const { currentTime, totalTime } = useMemo(() => {
    if (!metadata) return { currentTime: "00:00:00.00", totalTime: "00:00:00.00" };
    return {
      currentTime: formatTimeDisplay(currentFrameIndex / metadata.fps),
      totalTime: formatTimeDisplay(metadata.duration)
    };
  }, [metadata, currentFrameIndex]);

  // Subtitle Lanes Calculation
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

  // --- ZOOM & SCROLL LOGIC ---
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
        // ZOOM
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        setZoomLevel(prev => Math.min(Math.max(1, prev + delta), 20)); // Max 20x zoom
    } else if (e.shiftKey && scrollContainerRef.current) {
        // SCROLL
        scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!metadata || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollLeft = scrollContainerRef.current.scrollLeft;

    // Calc total width of the timeline content
    const totalWidth = rect.width * zoomLevel; // Approximate visual width if zoomed
    // Wait, better approach:
    // The inner div width is `${zoomLevel * 100}%` of parent.
    // Actually, click is relative to viewport. We need click relative to content.

    const contentX = clickX + scrollLeft;
    const containerWidth = scrollContainerRef.current.scrollWidth;

    const percent = contentX / containerWidth;
    const targetFrame = Math.floor(percent * metadata.total_frames);

    setCurrentFrame(Math.min(Math.max(0, targetFrame), metadata.total_frames - 1));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setHoverPos(e.clientX - rect.left);
  };

  if (!metadata) return null;

  // Percentage for the playhead
  const progressPercent = ((currentFrameIndex) / (metadata.total_frames - 1)) * 100;

  return (
    <div className="bg-[#1e1e1e] border border-[#333333] shadow-2xl select-none flex flex-col rounded-xl overflow-hidden">

      {/* 1. Control Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333333]">

        {/* Time Display */}
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

        {/* Transport Controls */}
        <div className="flex items-center gap-1 bg-[#1e1e1e] p-1 rounded-lg border border-[#333333]">
            <button onClick={() => setCurrentFrame(f => Math.max(0, f - 1))} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Prev Frame">
                <ChevronLeft size={16} />
            </button>
             {/* Zoom Controls */}
            <div className="flex items-center px-2 gap-1 border-l border-[#333333] ml-1 pl-2">
                <button onClick={() => setZoomLevel(z => Math.max(1, z - 0.5))} className="p-1 text-[#858585] hover:text-white"><ZoomOut size={14}/></button>
                <span className="text-[10px] font-mono w-8 text-center">{Math.round(zoomLevel * 100)}%</span>
                <button onClick={() => setZoomLevel(z => Math.min(20, z + 0.5))} className="p-1 text-[#858585] hover:text-white"><ZoomIn size={14}/></button>
            </div>
            <button onClick={() => setCurrentFrame(f => Math.min(metadata.total_frames - 1, f + 1))} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Next Frame">
                <ChevronRight size={16} />
            </button>
        </div>

        {/* Duration */}
        <div className="flex flex-col items-end w-32 opacity-60">
             <span className="text-xs font-mono text-[#858585] font-medium">{totalTime}</span>
        </div>
      </div>


      {/* 2. Timeline Track Area */}
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredSub(null)}
        className="relative h-28 bg-[#18181b] w-full group overflow-hidden"
      >
          {/* Scrollable Container */}
          <div
            ref={scrollContainerRef}
            className="w-full h-full overflow-x-auto overflow-y-hidden custom-scrollbar relative"
            onWheel={handleWheel}
            onClick={handleTimelineClick}
          >
              {/* Scalable Content Track */}
              <div
                className="h-full relative transition-all duration-75 ease-out"
                style={{ width: `${zoomLevel * 100}%` }}
              >
                  {/* Ruler Marks */}
                  <div className="absolute top-0 w-full h-4 border-b border-[#333333] flex justify-between px-[2px] opacity-50">
                     {Array.from({ length: 20 * Math.ceil(zoomLevel) }).map((_, i) => (
                         <div key={i} className={cn("w-px bg-[#333333]", i % 10 === 0 ? "h-2 mt-1" : "h-1 mt-2")} />
                     ))}
                  </div>

                  {/* Subtitle Blocks */}
                  <div className="absolute top-6 w-full h-full pointer-events-none">
                    {processedSubtitles.map((sub) => {
                      const startPercent = (sub.start / metadata.duration) * 100;
                      const durationPercent = ((sub.end - sub.start) / metadata.duration) * 100;
                      const isActive = (currentFrameIndex / metadata.fps) >= sub.start && (currentFrameIndex / metadata.fps) <= sub.end;

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
                            width: `${Math.max(durationPercent, 0.1)}%`, // Ensure visible even if short
                            top: `${sub.track * 28}px`,
                          }}
                          onMouseEnter={() => setHoveredSub(sub)}
                        >
                            <div className={cn(
                                "w-full h-full rounded-sm border transition-all duration-150 backdrop-blur-sm truncate px-1 text-[9px] font-mono leading-6 opacity-80 hover:opacity-100",
                                colorClass
                            )}>
                                {zoomLevel > 3 && sub.text} {/* Show text only if zoomed in */}
                            </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Playhead */}
                  <div
                    className="absolute top-0 bottom-0 z-10 w-px pointer-events-none transition-all duration-75 ease-linear will-change-left"
                    style={{ left: `${progressPercent}%` }}
                  >
                      <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] bg-red-500 rounded-full shadow-md border-[2px] border-[#18181b]" />
                      <div className="absolute top-1.5 h-full w-[1.5px] -left-[0.75px] bg-red-500/80 rounded-full" />
                  </div>
              </div>
          </div>

          {/* Hover Tooltip (Static Position relative to viewport) */}
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
