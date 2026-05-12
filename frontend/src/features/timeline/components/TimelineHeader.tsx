import React from 'react';
import { 
  ChevronLeft, ChevronRight, Clock, ZoomIn, ZoomOut, 
  Play, Pause, Volume2, Magnet 
} from 'lucide-react';
import { cn } from '../../../shared/lib';

interface Props {
  currentTimeDisplay: string;
  totalTimeDisplay: string;
  currentFrame: number;
  isPlaying: boolean;
  isSnapping: boolean;
  zoomLevel: number;
  volume: number;
  isPreviewMode: boolean;
  onPlayPause?: () => void;
  onStepFrame?: (frames: number) => void;
  onToggleSnapping: () => void;
  onZoom: (delta: number) => void;
  onVolumeChange?: (vol: number) => void;
}

/**
 * Top control bar for the timeline containing playback, zoom, and snapping toggles.
 */
export const TimelineHeader = ({
  currentTimeDisplay,
  totalTimeDisplay,
  currentFrame,
  isPlaying,
  isSnapping,
  zoomLevel,
  volume,
  isPreviewMode,
  onPlayPause,
  onStepFrame,
  onToggleSnapping,
  onZoom,
  onVolumeChange
}: Props) => {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-bg-panel border-b border-border-main">
      <div className="flex items-center gap-3 w-48 shrink-0">
        <div className="p-1.5 bg-bg-surface rounded-md text-brand-500">
          <Clock size={14} />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-mono font-bold text-white leading-none tracking-wide">
            {currentTimeDisplay}
          </span>
          <span className="text-[9px] text-txt-subtle font-mono mt-0.5">
            FRAME: <span className="text-txt-muted">{currentFrame}</span>
          </span>
        </div>
      </div>

      <div className="flex-1 flex justify-center min-w-0">
        <div className="flex items-center gap-1 bg-bg-main p-1 rounded-lg border border-border-main shadow-sm">
          {isPreviewMode && onStepFrame && (
            <>
              <button onClick={() => onStepFrame(-1)} className="p-2 rounded-md hover:bg-bg-surface text-txt-subtle hover:text-white transition">
                <ChevronLeft size={16} />
              </button>
              <button onClick={onPlayPause} className="p-2 rounded-md bg-brand-500/10 text-brand-500 hover:bg-brand-500 hover:text-white transition shadow-sm">
                {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              </button>
              <button onClick={() => onStepFrame(1)} className="p-2 rounded-md hover:bg-bg-surface text-txt-subtle hover:text-white transition">
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 w-48 shrink-0">
        <button 
          onClick={onToggleSnapping} 
          className={cn("p-1.5 rounded-md transition border", isSnapping ? "bg-brand-500/20 text-brand-500 border-brand-500/50" : "bg-bg-surface text-txt-subtle hover:text-white border-transparent")}
          title="Toggle Snapping (S)"
        >
          <Magnet size={14} />
        </button>
        
        <div className="flex items-center bg-bg-main rounded-lg border border-border-main px-2 py-1.5 gap-2">
          <button onClick={() => onZoom(-0.5)} className="text-txt-subtle hover:text-white"><ZoomOut size={14}/></button>
          <span className="text-[10px] font-mono w-8 text-center">{Math.round(zoomLevel * 100)}%</span>
          <button onClick={() => onZoom(0.5)} className="text-txt-subtle hover:text-white"><ZoomIn size={14}/></button>
        </div>

        {isPreviewMode && onVolumeChange && (
          <div className="flex items-center gap-1.5 bg-bg-main rounded-lg border border-border-main px-2 py-1.5">
            <Volume2 size={14} className="text-txt-subtle" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-24 accent-brand-500"
            />
          </div>
        )}
        {!isPreviewMode && (
          <div className="flex flex-col items-end opacity-60">
            <span className="text-xs font-mono text-txt-subtle font-medium">{totalTimeDisplay}</span>
          </div>
        )}
      </div>
    </div>
  );
};