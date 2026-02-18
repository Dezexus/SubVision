import React, { useState } from 'react';
import { Copy, Trash2, ArrowDownToLine } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { formatTimeDisplay } from '../../../utils/format';

export const SubtitleCard = ({ item, index }: { item: SubtitleItem, index: number }) => {
  const { updateSubtitle, deleteSubtitle, mergeSubtitles, setCurrentFrame, metadata, subtitles } = useAppStore();
  const [isCopied, setIsCopied] = useState(false);

  const isHighConf = item.conf > 0.85;
  const isLowConf = item.conf < 0.6;
  const hasNext = index < subtitles.length - 1;

  const handleJump = () => {
    if (metadata) {
      const frame = Math.round(item.start * metadata.fps);
      setCurrentFrame(frame);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(item.text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className={cn(
      "group relative flex flex-col gap-3 p-3 rounded-lg border transition-all duration-200",
      "bg-[#252526] hover:bg-[#2a2d2e]",
      item.isEdited ? "border-[#007acc]/50" :
      isLowConf ? "border-red-500/30" : "border-[#333333]"
    )}>

      {/* Main Text Input
          pr-16: Добавлен отступ справа, чтобы текст не наезжал на кнопки
      */}
      <textarea
        value={item.text}
        onChange={(e) => updateSubtitle({ ...item, text: e.target.value })}
        className="w-full bg-transparent text-sm text-[#F0F0F0] resize-none focus:outline-none focus:ring-1 focus:ring-[#007acc] rounded px-1 pr-16 leading-snug min-h-[40px] scrollbar-hide"
        rows={2}
        spellCheck={false}
      />

      {/* Footer Info */}
      <div className="flex items-center justify-between text-xs text-[#858585] mt-1">
        <div className="flex items-center gap-3">
          <span
            onClick={handleJump}
            className="font-mono cursor-pointer hover:text-[#007acc] transition-colors"
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
            {/* NEW MERGE BUTTON LOCATION: Always visible in footer */}
            {hasNext && (
                <button
                    onClick={() => mergeSubtitles(index)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#333333] hover:bg-[#007acc] text-[#C5C5C5] hover:text-white transition-colors text-[10px] font-bold"
                    title="Merge with Next Line"
                >
                    <ArrowDownToLine size={12} />
                    MERGE
                </button>
            )}

            {item.isEdited && (
                 <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1 rounded border border-blue-500/20">EDITED</span>
            )}
        </div>
      </div>

      {/* Action Buttons (Top Right) - Only Admin Actions (Copy/Delete) */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-[#252526]/80 backdrop-blur-sm rounded-bl-lg pl-2 pb-1">
        <button
          onClick={handleCopy}
          className="p-1.5 text-[#858585] hover:text-white hover:bg-white/10 rounded"
          title="Copy Text"
        >
          <Copy size={14} />
          {isCopied && <span className="absolute -top-5 right-0 text-xs bg-black p-1 rounded text-white">Copied!</span>}
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
