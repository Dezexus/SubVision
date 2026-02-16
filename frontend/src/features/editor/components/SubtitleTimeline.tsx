// A timeline component to visualize subtitle blocks and allow seeking.
import React, { useRef } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';

export const SubtitleTimeline = () => {
  const { metadata, subtitles, currentFrameIndex, setCurrentFrame } = useAppStore();
  const containerRef = useRef<HTMLDivElement>(null);

  if (!metadata || metadata.duration === 0) return null;

  // Calculate the current playhead position as a percentage
  const currentTime = currentFrameIndex / metadata.fps;
  const playheadPercent = (currentTime / metadata.duration) * 100;

  // Handle click events to seek to a specific time
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const clickPercent = Math.max(0, Math.min(1, x / rect.width));

    const targetTime = clickPercent * metadata.duration;
    const targetFrame = Math.floor(targetTime * metadata.fps);

    setCurrentFrame(targetFrame);
  };

  return (
    <div className="w-full px-1">
      <div
        ref={containerRef}
        className="relative h-8 bg-[#18181b] border border-[#333333] rounded cursor-pointer overflow-hidden group select-none"
        onClick={handleSeek}
      >
        {/* Optional: Add grid lines for better orientation */}
        <div className="absolute inset-0 flex justify-between px-[10%] pointer-events-none opacity-20">
             {[...Array(9)].map((_, i) => <div key={i} className="w-px h-full bg-white/20" />)}
        </div>

        {/* Render each subtitle as a block on the timeline */}
        {subtitles.map((sub) => {
          const startPercent = (sub.start / metadata.duration) * 100;
          const durationPercent = ((sub.end - sub.start) / metadata.duration) * 100;

          // Determine block color based on confidence score
          let colorClass = "bg-yellow-500/40 border-yellow-500/60"; // Mid confidence
          if (sub.conf > 0.85) colorClass = "bg-brand-500/40 border-brand-500/60"; // High
          if (sub.conf < 0.6) colorClass = "bg-red-500/40 border-red-500/60"; // Low

          return (
            <div
              key={sub.id}
              className={cn("absolute top-1 bottom-1 border-l border-r rounded-[1px] hover:brightness-150 transition-all", colorClass)}
              style={{
                left: `${startPercent}%`,
                width: `${Math.max(durationPercent, 0.2)}%`, // Ensure a minimum visible width
              }}
              title={`[${Math.round(sub.conf * 100)}%] ${sub.text}`}
            />
          );
        })}

        {/* Current Time Indicator (Playhead) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 shadow-[0_0_8px_rgba(239,68,68,0.8)] pointer-events-none transition-all duration-75 ease-linear"
          style={{ left: `${playheadPercent}%` }}
        >
          {/* Arrowhead for the playhead */}
          <div className="absolute -top-1 -left-1.5 w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[6px] border-t-red-500" />
        </div>

        {/* Visual feedback layer on hover */}
        <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
      </div>
    </div>
  );
};
