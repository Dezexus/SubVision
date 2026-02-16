// A card component for displaying and editing a single subtitle item.
import React, { useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const SubtitleCard = ({ item }: { item: SubtitleItem }) => {
  const { updateSubtitle, deleteSubtitle, setCurrentFrame, metadata } = useAppStore();
  const [isCopied, setIsCopied] = useState(false);

  const isHighConf = item.conf > 0.85;
  const isLowConf = item.conf < 0.6;

  // #1: Seek video to the subtitle's start time
  const handleJump = () => {
    if (metadata) {
      const frame = Math.round(item.start * metadata.fps);
      setCurrentFrame(frame);
    }
  };

  // Action for the copy button
  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
  };

  return (
    <div className={cn(
      "group relative flex flex-col gap-3 p-3 rounded-lg border transition-all duration-200",
      "bg-[#252526] hover:bg-[#2a2d2e]",
      item.isEdited ? "border-[#007acc]/50" : // #2: Blue border if edited
      isLowConf ? "border-red-500/30" : "border-[#333333]"
    )}>

      {/* #4: Main editable text area is now the primary element */}
      <textarea
        value={item.text}
        onChange={(e) => updateSubtitle({ ...item, text: e.target.value })}
        className="w-full bg-transparent text-sm text-[#F0F0F0] resize-none focus:outline-none focus:ring-1 focus:ring-[#007acc] rounded px-1 leading-snug min-h-[40px] scrollbar-hide"
        rows={2}
        spellCheck={false}
      />

      {/* #4: Metadata is grouped at the bottom */}
      <div className="flex items-center justify-between text-xs text-[#858585]">
        <div className="flex items-center gap-3">
          {/* #1: Interactive timestamp */}
          <span
            onClick={handleJump}
            className="font-mono cursor-pointer hover:text-[#007acc] transition-colors"
            title="Jump to time"
          >
            {formatTime(item.start)}
          </span>

          {/* Confidence Badge */}
          <span className={cn(
            "text-[9px] font-bold px-1.5 py-0.5 rounded",
            isHighConf ? "bg-green-500/10 text-green-400" :
            isLowConf ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-500"
          )}>
            {Math.round(item.conf * 100)}%
          </span>
        </div>

        {/* #2: Edit Indicator Dot */}
        <div className="flex items-center gap-2">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full bg-[#007acc] transition-opacity duration-300",
              item.isEdited ? 'opacity-100' : 'opacity-0'
            )} title="Manually Edited" />
            <span className={cn(item.isEdited ? "opacity-100" : "opacity-0", "transition-opacity duration-300")}>
              Edited
            </span>
        </div>
      </div>


      {/* #6: Hover Actions Panel */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button
          onClick={handleCopy}
          className="p-1.5 text-[#858585] hover:text-white hover:bg-white/10 rounded"
          title="Copy Text"
        >
          <Copy size={14} />
          {isCopied && <span className="absolute -top-5 right-0 text-xs bg-black p-1 rounded">Copied!</span>}
        </button>
        <button
          onClick={() => deleteSubtitle(item.id)}
          className="p-1.5 text-[#858585] hover:text-red-400 hover:bg-red-500/10 rounded"
          title="Delete Line"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
};
