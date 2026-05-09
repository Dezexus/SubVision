import React from 'react';
import { Clock, Activity, CheckCircle2 } from 'lucide-react';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import { cn } from '../../../utils/cn';

export const ProgressHeader = () => {
  const progress = useProcessingStore((s) => s.progress);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const metadata = useVideoStore((s) => s.metadata);

  const totalFrames = progress.total > 0 ? progress.total : (metadata?.total_frames || 0);
  const percentage = totalFrames > 0 ? Math.round((progress.current / totalFrames) * 100) : 0;
  
  const showProgress = isProcessing || percentage > 0;

  if (!showProgress && !isProcessing) {
    return null;
  }

  return (
    <div className="p-4 border-b border-border-main bg-bg-panel transition-all duration-300 ease-in-out overflow-hidden">
      <div className="flex justify-between items-end mb-3 font-sans">
        <div className="flex items-center gap-2">
          {isProcessing ? (
            <Activity size={16} className="text-brand-500 animate-pulse" />
          ) : percentage === 100 ? (
            <CheckCircle2 size={16} className="text-green-500" />
          ) : null}
          <span className={cn(
            "text-sm font-bold tracking-wide uppercase",
            isProcessing ? "text-brand-400" : percentage === 100 ? "text-green-500" : "text-txt-subtle"
          )}>
            {isProcessing ? 'Processing...' : percentage === 100 ? 'Completed' : 'Ready'}
          </span>
        </div>
        {isProcessing && progress.eta && (
          <div className="flex items-center gap-1.5 text-xs text-txt-subtle font-mono bg-bg-surface px-2 py-0.5 rounded-sm border border-border-strong">
            <Clock size={12} />
            <span>ETA: <span className="text-txt-main font-bold">{progress.eta}</span></span>
          </div>
        )}
      </div>

      <div className="relative w-full h-2 bg-bg-track rounded-full overflow-hidden border border-border-main shadow-inner">
        <div
          className={cn(
            "h-full transition-all duration-300 ease-out rounded-full relative overflow-hidden",
            isProcessing ? "bg-brand-500" : percentage === 100 ? "bg-green-500" : "bg-bg-surface"
          )}
          style={{ width: `${percentage}%` }}
        >
          {isProcessing && (
            <div className="absolute inset-0 w-full h-full" 
                 style={{
                   backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
                   backgroundSize: '1rem 1rem',
                   animation: 'progress-stripes 1s linear infinite'
                 }}
            />
          )}
        </div>
      </div>

      <div className="flex justify-between mt-2 text-[10px] font-mono text-txt-subtle uppercase tracking-wider">
        <span>Frame: <span className="text-txt-main font-medium">{progress.current}</span> / {totalFrames}</span>
        <span className="font-bold text-txt-main">{percentage}%</span>
      </div>

      <style>{`
        @keyframes progress-stripes {
          from { background-position: 1rem 0; }
          to { background-position: 0 0; }
        }
      `}</style>
    </div>
  );
};