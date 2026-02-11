import React, { useMemo } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { Slider } from '../../../components/ui/Slider';
import { cn } from '../../../utils/cn';

export const TimelineScrubber = () => {
  const { metadata, currentFrameIndex, setCurrentFrame } = useAppStore();

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  };

  const timeDisplay = useMemo(() => {
    if (!metadata) return { current: "00:00:00", total: "00:00:00" };
    const currentSec = currentFrameIndex / metadata.fps;
    return {
      current: formatTime(currentSec),
      total: formatTime(metadata.duration)
    };
  }, [metadata, currentFrameIndex]);

  if (!metadata) return null;

  return (
    <div className="w-full px-6 py-4 bg-glass-300 border-b border-glass-border flex items-center gap-4 z-10 backdrop-blur-md">
      <span className="text-xs font-mono text-brand-400 w-16 text-right">
        {timeDisplay.current}
      </span>

      <div className="flex-1 group">
        <Slider
          min={0}
          max={metadata.total_frames - 1}
          value={currentFrameIndex}
          onChange={(e) => setCurrentFrame(Number(e.target.value))}
          className="accent-brand-500"
        />
        {/* Tooltip on hover logic could go here */}
      </div>

      <span className="text-xs font-mono text-gray-500 w-16">
        {timeDisplay.total}
      </span>
    </div>
  );
};
