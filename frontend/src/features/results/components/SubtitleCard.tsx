import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { cn } from '../../../utils/cn';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const SubtitleCard = ({ item }: { item: SubtitleItem }) => {
  const isHighConf = item.conf > 0.85;
  const isLowConf = item.conf < 0.6;

  return (
    <div className={cn(
      "group flex items-start gap-3 p-2 rounded hover:bg-[#2a2d2e] transition-colors cursor-pointer border-l-2",
      isLowConf ? "border-red-500 bg-red-500/5" : "border-transparent"
    )}>

      {/* 1. Meta Column (Fixed Width) */}
      <div className="flex flex-col items-end min-w-[80px] pt-0.5">
        <span className="text-[11px] font-mono text-[#858585] group-hover:text-[#C5C5C5]">
          {formatTime(item.start)}
        </span>
        <span className={cn(
          "text-[10px] font-bold mt-0.5",
          isHighConf ? "text-green-500" :
          isLowConf ? "text-red-400" : "text-yellow-500"
        )}>
          {Math.round(item.conf * 100)}%
        </span>
      </div>

      {/* 2. Text Column (Fluid) */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#F0F0F0] leading-snug break-words">
          {item.text}
        </p>
        {item.is_corrected && (
           <div className="mt-1 text-[10px] text-[#007acc] flex items-center gap-1">
             AI FIXED
           </div>
        )}
      </div>

      {/* 3. Status Icon (Optional, only for issues) */}
      {isLowConf && (
        <div className="pt-0.5">
           <AlertCircle size={14} className="text-red-500" />
        </div>
      )}
    </div>
  );
};
