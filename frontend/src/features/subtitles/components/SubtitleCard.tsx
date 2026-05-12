import React, { useState, useEffect } from 'react';
import { Copy, Trash2, ArrowDownToLine } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import { useUIStore } from '../../../store/uiStore';
import { cn, formatTimeDisplay } from '../../../shared/lib';

/**
 * Displays an individual subtitle item with editing, merging, and deletion capabilities.
 */
export const SubtitleCard = ({ item, index }: { item: SubtitleItem, index: number }) => {
  const updateSubtitle = useProcessingStore((s) => s.updateSubtitle);
  const deleteSubtitle = useProcessingStore((s) => s.deleteSubtitle);
  const mergeSubtitles = useProcessingStore((s) => s.mergeSubtitles);
  const saveHistory = useProcessingStore((s) => s.saveHistory);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const metadata = useVideoStore((s) => s.metadata);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const setCurrentFrame = useVideoStore((s) => s.setCurrentFrame);
  const addToast = useUIStore((s) => s.addToast);

  const [isHovered, setIsHovered] = useState(false);

  const isActive = metadata
    ? (currentFrameIndex / metadata.fps) >= item.start && (currentFrameIndex / metadata.fps) <= item.end
    : false;

  const isHighConf = item.conf > 0.85;
  const isLowConf = item.conf < 0.6;
  const hasNext = index < subtitles.length - 1;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
      }
      if (isHovered && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSubtitle(item.id);
      }
    };
   
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isHovered, item.id, deleteSubtitle]);

  const handleJump = () => {
    if (metadata) {
      const frame = Math.round(item.start * metadata.fps);
      setCurrentFrame(frame);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    addToast('Subtitle copied to clipboard', 'success');
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative flex flex-col gap-2 p-3 rounded-xl border transition-all duration-200",
        isActive ? "bg-bg-hover border-brand-500 shadow-[0_0_10px_rgba(0,122,204,0.15)]" : "bg-bg-panel border-border-main hover:border-border-strong",
        !isActive && item.isEdited ? "border-brand-500/40" : "",
        !isActive && !item.isEdited && isLowConf ? "border-red-500/30" : ""
      )}
    >
      <textarea
        value={item.text}
        onFocus={() => saveHistory()}
        onChange={(e) => updateSubtitle({ ...item, text: e.target.value })}
        className="w-full bg-transparent text-[14px] text-txt-main resize-none focus:outline-none focus:ring-1 focus:ring-brand-500/50 rounded-md px-1 py-0.5 transition-colors leading-relaxed min-h-[48px] scrollbar-hide border border-transparent focus:border-brand-500/30"
        rows={2}
        spellCheck={false}
      />
      <div className="flex items-center justify-between text-xs mt-1 px-1">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[10px] font-bold text-txt-dim bg-bg-surface px-1.5 py-0.5 rounded-sm">
            #{index + 1}
          </span>
          <button 
            onClick={handleJump} 
            className="font-mono text-[11px] text-txt-subtle hover:text-brand-500 transition-colors" 
            title="Jump to time"
          >
            {formatTimeDisplay(item.start)}
          </button>
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide",
            isHighConf ? "bg-green-500/10 text-green-400" :
            isLowConf ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-500"
          )}>
            {Math.round(item.conf * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasNext && (
            <button
              onClick={() => mergeSubtitles(index)}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-surface hover:bg-brand-500 text-txt-muted hover:text-white transition-all text-[10px] font-bold uppercase tracking-wider shadow-sm opacity-50 group-hover:opacity-100"
              title="Merge with Next Line"
            >
              <ArrowDownToLine size={12} />
              Merge
            </button>
          )}
          {item.isEdited && (
            <span className="text-[9px] font-bold bg-blue-500/10 text-brand-400 px-1.5 py-0.5 rounded border border-brand-500/20">
              EDITED
            </span>
          )}
        </div>
      </div>
      
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-bg-panel/90 backdrop-blur-md rounded-md p-1 border border-border-strong shadow-lg translate-y-[-4px] group-hover:translate-y-0">
        <button onClick={handleCopy} className="p-1.5 text-txt-subtle hover:text-white hover:bg-white/10 rounded transition-colors" title="Copy Text">
          <Copy size={14} />
        </button>
        <button onClick={() => deleteSubtitle(item.id)} className="p-1.5 text-txt-subtle hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title="Delete Line">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};