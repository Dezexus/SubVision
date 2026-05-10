import React from 'react';
import { Trash2 } from 'lucide-react';
import type { SubtitleItem } from '../../../types';

interface Props {
  activeSub: SubtitleItem | null | undefined;
  text: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onDelete: () => void;
}

/**
 * Editor for the active subtitle with increased font size and vertical centering.
 */
export const ActiveSubtitleEditor = ({ activeSub, text, onChange, onFocus, onBlur, onDelete }: Props) => {
  if (!activeSub) {
    return (
      <div className="shrink-0 h-[126px] w-full bg-bg-main border border-border-main rounded-xl p-3 shadow-xl flex items-center justify-center text-txt-subtle transition-colors duration-300">
        <div className="flex flex-col items-center gap-2 opacity-50">
          <span className="text-xs font-medium tracking-wide italic">No active subtitle selection</span>
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 h-[126px] w-full bg-bg-main border border-border-main rounded-xl p-3 shadow-xl flex transition-colors duration-300">
      <div className="flex-1 relative flex items-center justify-center group/editor">
        <textarea
          value={text}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={(e) => e.stopPropagation()}
          className="w-full h-auto bg-bg-main border-none rounded-lg p-3 text-txt-main text-2xl text-center resize-none focus:outline-none focus:ring-0 transition-colors scrollbar-hide"
          placeholder="Enter subtitle text..."
          rows={1}
        />
        <button
          onClick={onDelete}
          className="absolute right-4 top-4 p-2 text-txt-subtle hover:text-white hover:bg-red-500/80 rounded-md opacity-0 group-hover/editor:opacity-100 transition-all z-10"
          title="Delete Line"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </div>
  );
};