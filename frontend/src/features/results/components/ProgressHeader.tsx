/**
 * Component showing the processing status, ETA, and progress bar for the active task.
 */
import React from 'react';
import { Clock, Activity } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';

export const ProgressHeader = () => {
  const { progress, isProcessing, metadata } = useAppStore();

  const totalFrames = progress.total > 0 ? progress.total : (metadata?.total_frames || 0);

  const percentage = totalFrames > 0
    ? Math.round((progress.current / totalFrames) * 100)
    : 0;

  return (
    <div className="p-4 border-b border-border-main bg-bg-panel">
      <div className="flex justify-between items-end mb-3 font-sans">
        <div className="flex items-center gap-2">
          {isProcessing && <Activity size={14} className="text-brand-500 animate-pulse" />}
          <span className={cn(
            "text-sm font-bold tracking-wide uppercase",
            isProcessing ? "text-txt-main" : "text-txt-subtle"
          )}>
            {isProcessing ? 'Processing...' : 'Ready'}
          </span>
        </div>
        {isProcessing && (
          <div className="flex items-center gap-1.5 text-xs text-txt-subtle font-mono">
            <Clock size={12} />
            <span>ETA: <span className="text-txt-main font-bold">{progress.eta}</span></span>
          </div>
        )}
      </div>

      <div className="relative w-full h-1.5 bg-bg-track rounded-full overflow-hidden border border-border-main">
        <div
          className={cn(
            "h-full transition-all duration-300 ease-out rounded-full",
            isProcessing ? "bg-brand-500" : percentage === 100 ? "bg-green-500" : "bg-bg-surface"
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex justify-between mt-1.5 text-[10px] font-mono text-txt-subtle uppercase tracking-wider">
        <span>Frame: <span className="text-txt-muted">{progress.current}</span> / {totalFrames}</span>
        <span className="font-bold text-txt-main">{percentage}%</span>
      </div>
    </div>
  );
};
