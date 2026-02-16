import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { formatTimeDisplay } from '../../../utils/format';
import type { SubtitleItem } from '../../../types';

type ProcessedSubtitle = SubtitleItem & { track: number };

export const HybridTimeline = () => {
  const { metadata, subtitles, currentFrameIndex, setCurrentFrame } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const [localFrame, setLocalFrame] = useState(currentFrameIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [hoveredSub, setHoveredSub] = useState<ProcessedSubtitle | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

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
    setTooltipPosition({ x: e.clientX, y: rect.top });
  };

  if (!metadata) return null;

  const percentage = Math.min(Math.max(((localFrame) / (metadata.total_frames - 1)) * 100, 0), 100);

  return (
    <div className="bg-[#1e1e1e] border border-[#333333] rounded-xl p-4 flex flex-col gap-2 shadow-xl w-full">
      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredSub(null)}
        className="flex items-center gap-4"
      >
        <div className="flex flex-col items-end w-20">
          <span className={cn("text-sm font-mono font-bold leading-none", isDragging ? "text-white" : "text-[#007acc]")}>
            {currentTime}
          </span>
          <span className="text-[10px] text-[#858585] font-mono mt-0.5">
            FRAME {localFrame}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={handlePrevSub} title="Previous subtitle" className="p-2 rounded-full hover:bg-[#333333] text-[#C5C5C5] hover:text-white transition"><SkipBack size={16} /></button>
          <button onClick={() => setCurrentFrame(f => Math.max(0, f - 1))} title="Previous frame" className="p-2 rounded-full hover:bg-[#333333] text-[#C5C5C5] hover:text-white transition"><ChevronLeft size={18} /></button>
        </div>

        <div className="relative flex-1 h-12 flex items-center group">
          <input
            type="range"
            min={0}
            max={metadata.total_frames - 1}
            value={localFrame}
            onChange={handleSliderChange}
            onMouseUp={handleSliderCommit}
            onTouchEnd={handleSliderCommit}
            className="w-full absolute z-30 opacity-0 cursor-pointer h-full appearance-none bg-transparent"
          />

          <div className="w-full h-4 bg-[#18181b] rounded-full border border-[#333333] relative z-10 pointer-events-none shadow-inner" />

          <div className="absolute w-full h-full top-0 left-0 pointer-events-none z-20 p-2">
            {processedSubtitles.map((sub) => {
              const startPercent = (sub.start / metadata.duration) * 100;
              const durationPercent = ((sub.end - sub.start) / metadata.duration) * 100;
              const isActive = (localFrame / metadata.fps) >= sub.start && (localFrame / metadata.fps) <= sub.end;

              return (
                <div
                  key={sub.id}
                  onMouseEnter={() => setHoveredSub(sub)}
                  className={cn("absolute rounded-sm transition-all duration-100 ease-linear border",
                    isActive && "ring-1 ring-white/80 ring-offset-black/50 z-10 brightness-150",
                    sub.isEdited ? "border-blue-400" : "border-transparent"
                  )}
                  style={{
                    left: `${startPercent}%`,
                    width: `${Math.max(durationPercent, 0.2)}%`,
                    top: `${sub.track * 4 + 2}px`,
                    height: "3px"
                  }}
                >
                  <div className={cn( "w-full h-full", sub.conf > 0.85 ? 'bg-green-400' : sub.conf < 0.6 ? 'bg-red-400' : 'bg-yellow-400')} />
                </div>
              );
            })}
          </div>

          <div
            className="absolute h-5 w-5 bg-[#F0F0F0] border-2 border-[#1e1e1e] rounded-full shadow-lg z-20 pointer-events-none transition-transform duration-75 ease-out group-hover:scale-110"
            style={{ left: `calc(${percentage}% - 10px)` }}
          />
        </div>

        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentFrame(f => Math.min(metadata.total_frames - 1, f + 1))} title="Next frame" className="p-2 rounded-full hover:bg-[#333333] text-[#C5C5C5] hover:text-white transition"><ChevronRight size={18} /></button>
          <button onClick={handleNextSub} title="Next subtitle" className="p-2 rounded-full hover:bg-[#333333] text-[#C5C5C5] hover:text-white transition"><SkipForward size={16} /></button>
        </div>

        <div className="flex flex-col items-start w-20">
          <span className="text-sm font-mono text-[#F0F0F0] font-medium leading-none">{totalTime}</span>
          <span className="text-[10px] text-[#858585] font-mono mt-0.5">TOTAL</span>
        </div>
      </div>

      {hoveredSub && (
        <div
          className="fixed z-50 p-2 text-xs text-white bg-black/80 border border-white/20 rounded-md shadow-lg pointer-events-none max-w-xs"
          style={{ left: `${tooltipPosition.x + 15}px`, top: `${tooltipPosition.y - 40}px` }}
        >
          {hoveredSub.text}
        </div>
      )}
    </div>
  );
};
