/**
 * Component representing a single interactive subtitle row in the results list.
 */
import React, { useState, useEffect } from 'react';
import { Copy, Trash2, ArrowDownToLine } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { formatTimeDisplay } from '../../../utils/format';

export const SubtitleCard = ({ item, index }: { item: SubtitleItem, index: number }) => {
  const { updateSubtitle, deleteSubtitle, mergeSubtitles, setCurrentFrame, metadata, subtitles, addToast } = useAppStore();
  const [isHovered, setIsHovered] = useState(false);

  const isActive = useAppStore(state => {
    if (!state.metadata) return false;
    const time = state.currentFrameIndex / state.metadata.fps;
    return time >= item.start && time <= item.end;
  });

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
        "group relative flex flex-col gap-3 p-3 rounded-lg border transition-all duration-200",
        isActive ? "bg-bg-hover border-brand-500 ring-1 ring-brand-500 shadow-sm" : "bg-bg-panel hover:bg-bg-hover",
        !isActive && item.isEdited ? "border-brand-500/50" : "",
        !isActive && !item.isEdited && isLowConf ? "border-red-500/30" : "",
        !isActive && !item.isEdited && !isLowConf ? "border-border-main" : ""
      )}
    >
      <textarea
        value={item.text}
        onChange={(e) => updateSubtitle({ ...item, text: e.target.value })}
        className="w-full bg-transparent text-sm text-txt-main resize-none focus:outline-none focus:ring-1 focus:ring-brand-500 rounded px-1 pr-16 leading-snug min-h-[40px] scrollbar-hide"
        rows={2}
        spellCheck={false}
      />

      <div className="flex items-center justify-between text-xs text-txt-subtle mt-1">
        <div className="flex items-center gap-3">
          <span
            onClick={handleJump}
            className="font-mono cursor-pointer hover:text-brand-500 transition-colors"
            title="Jump to time"
          >
            {formatTimeDisplay(item.start)}
          </span>

          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded",
            isHighConf ? "bg-green-500/10 text-green-400" :
            isLowConf ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-500"
          )}>
            {Math.round(item.conf * 100)}%
          </span>
        </div>

        <div className="flex items-center gap-2">
            {hasNext && (
                <button
                    onClick={() => mergeSubtitles(index)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-bg-surface hover:bg-brand-500 text-txt-muted hover:text-white transition-colors text-[10px] font-bold"
                    title="Merge with Next Line"
                >
                    <ArrowDownToLine size={12} />
                    MERGE
                </button>
            )}

            {item.isEdited && (
                 <span className="text-[9px] bg-blue-500/10 text-brand-400 px-1 rounded border border-brand-500/20">EDITED</span>
            )}
        </div>
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-bg-panel/80 backdrop-blur-sm rounded-bl-lg pl-2 pb-1">
        <button
          onClick={handleCopy}
          className="p-1.5 text-txt-subtle hover:text-white hover:bg-white/10 rounded"
          title="Copy Text"
        >
          <Copy size={14} />
        </button>
        <button
          onClick={() => deleteSubtitle(item.id)}
          className="p-1.5 text-txt-subtle hover:text-red-400 hover:bg-red-500/10 rounded"
          title="Delete Line"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};
