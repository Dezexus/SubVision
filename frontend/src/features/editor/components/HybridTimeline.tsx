import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronLeft, ChevronRight,
  SkipBack, SkipForward,
  Clock
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

  const [localFrame, setLocalFrame] = useState(currentFrameIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredSub, setHoveredSub] = useState<ProcessedSubtitle | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);

  useEffect(() => {
    if (!isDragging) {
      setLocalFrame(currentFrameIndex);
    }
  }, [currentFrameIndex, isDragging]);

  const { currentTime, totalTime } = useMemo(() => {
    if (!metadata) return { currentTime: "00:00:00.00", totalTime: "00:00:00.00" };
    return {
      currentTime: formatTimeDisplay(localFrame / metadata.fps),
      totalTime: formatTimeDisplay(metadata.duration)
    };
  }, [metadata, localFrame]);

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

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDragging(true);
    setLocalFrame(Number(e.target.value));
  };

  const handleSliderCommit = () => {
    setIsDragging(false);
    if (localFrame !== currentFrameIndex) {
      setCurrentFrame(localFrame);
    }
  };

  const handleNextSub = () => {
    const time = localFrame / (metadata?.fps || 25);
    const nextSub = subtitles.find(s => s.start > time);
    if (nextSub && metadata) {
      setCurrentFrame(Math.round(nextSub.start * metadata.fps));
    }
  };

  const handlePrevSub = () => {
    const time = localFrame / (metadata?.fps || 25);
    const prevSub = subtitles.slice().reverse().find(s => s.start < time);
    if (prevSub && metadata) {
      setCurrentFrame(Math.round(prevSub.start * metadata.fps));
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setHoverPos(x);
  };

  if (!metadata) return null;

  const progressPercent = ((localFrame) / (metadata.total_frames - 1)) * 100;

  return (
    <div className="bg-[#1e1e1e] border border-[#333333] shadow-2xl select-none flex flex-col rounded-xl overflow-hidden">

      {/* 1. Control Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#252526] border-b border-[#333333]">

        {/* Time Display */}
        <div className="flex items-center gap-3 w-32">
            <div className="p-1.5 bg-[#333333] rounded-md text-[#007acc]">
                <Clock size={14} />
            </div>
            <div className="flex flex-col">
                <span className="text-sm font-mono font-bold text-white leading-none tracking-wide">
                    {currentTime}
                </span>
                <span className="text-[9px] text-[#858585] font-mono mt-0.5">
                    FRAME: <span className="text-[#C5C5C5]">{localFrame}</span>
                </span>
            </div>
        </div>

        {/* Transport Controls (No Play Button) */}
        <div className="flex items-center gap-1 bg-[#1e1e1e] p-1 rounded-lg border border-[#333333]">
            <button onClick={handlePrevSub} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Previous Subtitle">
                <SkipBack size={14} fill="currentColor" />
            </button>
            <button onClick={() => setCurrentFrame(f => Math.max(0, f - 1))} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Prev Frame">
                <ChevronLeft size={16} />
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-[#333333] mx-1" />

            <button onClick={() => setCurrentFrame(f => Math.min(metadata.total_frames - 1, f + 1))} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Next Frame">
                <ChevronRight size={16} />
            </button>
            <button onClick={handleNextSub} className="p-1.5 rounded-md hover:bg-[#333333] text-[#858585] hover:text-white transition" title="Next Subtitle">
                <SkipForward size={14} fill="currentColor" />
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
        className="relative h-24 bg-[#18181b] w-full group cursor-pointer"
      >
          {/* Ruler Marks */}
          <div className="absolute top-0 w-full h-4 border-b border-[#333333] flex justify-between px-[2px]">
             {Array.from({ length: 21 }).map((_, i) => (
                 <div key={i} className={cn("w-px bg-[#333333] rounded-full", i % 5 === 0 ? "h-2 mt-1" : "h-1 mt-2")} />
             ))}
          </div>

          {/* Subtitle Blocks (Soft Corners) */}
          <div className="absolute top-5 w-full h-full pointer-events-none">
            {processedSubtitles.map((sub) => {
              const startPercent = (sub.start / metadata.duration) * 100;
              const durationPercent = ((sub.end - sub.start) / metadata.duration) * 100;
              const isActive = (localFrame / metadata.fps) >= sub.start && (localFrame / metadata.fps) <= sub.end;

              // Soft Color Palette
              let colorClass = "bg-[#333333] border-[#454545]";
              if (sub.isEdited) colorClass = "bg-blue-500/20 border-blue-500/40 text-blue-200";
              else if (sub.conf > 0.85) colorClass = "bg-emerald-500/20 border-emerald-500/40 text-emerald-200";
              else if (sub.conf < 0.6) colorClass = "bg-rose-500/20 border-rose-500/40 text-rose-200";
              else colorClass = "bg-amber-500/20 border-amber-500/40 text-amber-200";

              if (isActive) colorClass += " ring-1 ring-white/30 brightness-125";

              return (
                <div
                  key={sub.id}
                  className="absolute h-5 group/sub pointer-events-auto"
                  style={{
                    left: `${startPercent}%`,
                    width: `${Math.max(durationPercent, 0.2)}%`,
                    top: `${sub.track * 24 + 6}px`,
                  }}
                  onMouseEnter={() => setHoveredSub(sub)}
                >
                    <div className={cn(
                        "w-full h-full rounded-md border transition-all duration-150 backdrop-blur-sm",
                        colorClass
                    )} />
                </div>
              );
            })}
          </div>

          {/* Input Layer */}
          <input
            type="range"
            min={0}
            max={metadata.total_frames - 1}
            step={1}
            value={localFrame}
            onChange={handleSliderChange}
            onMouseUp={handleSliderCommit}
            onTouchEnd={handleSliderCommit}
            className="absolute inset-0 z-20 w-full h-full opacity-0 cursor-crosshair appearance-none m-0 p-0"
          />

          {/* Playhead (Soft "Lollipop") */}
          <div
            className="absolute top-0 bottom-0 z-10 w-px pointer-events-none transition-all duration-75 ease-linear will-change-left"
            style={{ left: `${progressPercent}%` }}
          >
              {/* Head */}
              <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] bg-red-500 rounded-full shadow-md border-[2px] border-[#18181b]" />
              {/* Line */}
              <div className="absolute top-1.5 h-full w-[1.5px] -left-[0.75px] bg-red-500/80 rounded-full" />
          </div>

          {/* Soft Tooltip */}
          {hoveredSub && (
            <div
                className="absolute z-50 bottom-full mb-3 pointer-events-none"
                style={{ left: Math.min(Math.max(hoverPos, 100), containerRef.current ? containerRef.current.clientWidth - 100 : 0) }}
            >
                <div className="bg-[#1e1e1e]/95 backdrop-blur border border-[#333333] p-3 rounded-xl shadow-2xl text-xs -translate-x-1/2 w-52">
                    <div className="flex justify-between text-[#858585] mb-1.5 font-mono text-[10px] uppercase tracking-wider">
                        <span>{formatTimeDisplay(hoveredSub.start)}</span>
                        <span className={cn(hoveredSub.conf > 0.8 ? "text-emerald-400" : "text-amber-400")}>
                            {Math.round(hoveredSub.conf * 100)}% CONF
                        </span>
                    </div>
                    <p className="text-[#F0F0F0] leading-relaxed font-medium">
                        {hoveredSub.text}
                    </p>
                </div>
            </div>
          )}

      </div>
    </div>
  );
};
