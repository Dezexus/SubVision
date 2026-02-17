import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { Slider } from '../../../components/ui/Slider';
import { cn } from '../../../utils/cn';
import { formatTimeDisplay } from '../../../utils/format';

export const VideoControls = () => {
  const { metadata, currentFrameIndex, setCurrentFrame } = useAppStore();

  const [localFrame, setLocalFrame] = useState(currentFrameIndex);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setLocalFrame(currentFrameIndex);
    }
  }, [currentFrameIndex, isDragging]);

  // Конвертер кадров в секунды для форматтера
  const getTime = (frame: number) => {
      if (!metadata) return 0;
      return frame / metadata.fps;
  }

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

  if (!metadata) return null;

  return (
    <div className="bg-[#1e1e1e] border border-[#333333] rounded-xl p-4 flex flex-col gap-2 shadow-xl w-full">
      <div className="flex items-center gap-5">

         <div className="flex flex-col items-end w-20">
            <span className={cn(
              "text-sm font-mono font-bold leading-none transition-colors",
              isDragging ? "text-white" : "text-[#007acc]"
            )}>
              {formatTimeDisplay(getTime(localFrame))}
            </span>
            <span className="text-[10px] text-[#858585] font-mono mt-0.5">
              FRAME {localFrame}
            </span>
         </div>

         <button
            onClick={() => setCurrentFrame(Math.max(0, currentFrameIndex - 1))}
            className="p-2 rounded-full hover:bg-[#333333] text-[#C5C5C5] hover:text-white active:scale-90 transition bg-[#252526] border border-[#3c3c3c]"
            title="Previous Frame"
         >
            <ChevronLeft size={18} />
         </button>

         <div className="flex-1 relative top-[1px]">
            <Slider
              min={0}
              max={metadata.total_frames - 1}
              value={localFrame}
              onChange={handleSliderChange}
              onMouseUp={handleSliderCommit}
              onTouchEnd={handleSliderCommit}
              className="w-full"
            />
         </div>

         <button
            onClick={() => setCurrentFrame(Math.min(metadata.total_frames - 1, currentFrameIndex + 1))}
            className="p-2 rounded-full hover:bg-[#333333] text-[#C5C5C5] hover:text-white active:scale-90 transition bg-[#252526] border border-[#3c3c3c]"
            title="Next Frame"
         >
            <ChevronRight size={18} />
         </button>

         <div className="flex flex-col items-start w-20">
            <span className="text-sm font-mono text-[#F0F0F0] font-medium leading-none">
              {formatTimeDisplay(getTime(metadata.total_frames))}
            </span>
            <span className="text-[10px] text-[#858585] font-mono mt-0.5">
              TOTAL
            </span>
         </div>

      </div>
    </div>
  );
};
