import React from 'react';
import { AlertCircle, Trash2, PlayCircle } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
};

export const SubtitleCard = ({ item }: { item: SubtitleItem }) => {
  const { updateSubtitle, deleteSubtitle, setCurrentFrame, metadata } = useAppStore();

  const isHighConf = item.conf > 0.85;
  const isLowConf = item.conf < 0.6;

  // Jump video to subtitle start
  const handleJump = () => {
    if (metadata) {
      const frame = Math.round(item.start * metadata.fps);
      setCurrentFrame(frame);
    }
  };

  return (
    <div className={cn(
      "group relative flex items-start gap-3 p-3 rounded-lg border transition-all duration-200",
      "bg-[#252526] hover:bg-[#2a2d2e]",
      isLowConf ? "border-red-500/30" : "border-[#333333]"
    )}>

      {/* 1. Controls & Meta */}
      <div className="flex flex-col items-center gap-2 pt-1 min-w-[60px]">
        {/* Play Button */}
        <button
          onClick={handleJump}
          className="text-[#858585] hover:text-[#007acc] transition-colors"
          title="Jump to time"
        >
          <PlayCircle size={16} />
        </button>

        {/* Timestamp */}
        <span className="text-[10px] font-mono text-[#858585]">
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

      {/* 2. Editable Text Area */}
      <div className="flex-1 min-w-0 relative">
        <textarea
          value={item.text}
          onChange={(e) => updateSubtitle({ ...item, text: e.target.value })}
          className="w-full bg-transparent text-sm text-[#F0F0F0] resize-none focus:outline-none focus:ring-1 focus:ring-[#007acc] rounded px-1 leading-snug min-h-[40px] scrollbar-hide"
          rows={2}
          spellCheck={false}
        />
        {isLowConf && (
          <div className="absolute top-0 right-0 pointer-events-none">
             <AlertCircle size={12} className="text-red-500/50" />
          </div>
        )}
      </div>

      {/* 3. Delete Action (Visible on Hover) */}
      <button
        onClick={() => deleteSubtitle(item.id)}
        className="opacity-0 group-hover:opacity-100 p-1.5 text-[#858585] hover:text-red-400 hover:bg-red-500/10 rounded transition-all absolute top-2 right-2"
        title="Delete Line"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
};
