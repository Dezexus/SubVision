import React from 'react';
import { Clock, Activity } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';

export const ProgressHeader = () => {
  const { progress, isProcessing } = useAppStore();

  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  return (
    <div className="p-4 border-b border-[#333333] bg-[#252526]">

      {/* 1. Header: Status Text + ETA */}
      <div className="flex justify-between items-end mb-3 font-sans">
        <div className="flex items-center gap-2">
          {isProcessing && <Activity size={14} className="text-[#007acc] animate-pulse" />}
          <span className={cn(
            "text-sm font-bold tracking-wide uppercase",
            isProcessing ? "text-[#F0F0F0]" : "text-[#858585]"
          )}>
            {isProcessing ? 'Processing...' : 'Ready'}
          </span>
        </div>

        {isProcessing && (
          <div className="flex items-center gap-1.5 text-xs text-[#858585] font-mono">
            <Clock size={12} />
            <span>ETA: <span className="text-[#F0F0F0] font-bold">{progress.eta}</span></span>
          </div>
        )}
      </div>

      {/* 2. Progress Bar Container */}
      <div className="relative w-full h-1.5 bg-[#18181b] rounded-full overflow-hidden border border-[#333333]">
        {/* Fill Bar */}
        <div
          className={cn(
            "h-full transition-all duration-300 ease-out rounded-full",
            isProcessing ? "bg-[#007acc]" : percentage === 100 ? "bg-green-500" : "bg-[#333333]"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* 3. Footer: Count + Percent */}
      <div className="flex justify-between mt-1.5 text-[10px] font-mono text-[#858585] uppercase tracking-wider">
        <span>Frame: <span className="text-[#C5C5C5]">{progress.current}</span> / {progress.total}</span>
        <span className="font-bold text-[#F0F0F0]">{percentage}%</span>
      </div>
    </div>
  );
};
