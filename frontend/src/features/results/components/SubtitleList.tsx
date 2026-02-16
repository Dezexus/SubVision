// A scrollable list that renders all subtitle items using SubtitleCard.
import React, { useRef, useEffect } from 'react';
import { useAppStore } from '../../../store/useAppStore';
import { SubtitleCard } from './SubtitleCard';

export const SubtitleList = () => {
  const { subtitles } = useAppStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Automatically scroll to the bottom when a new subtitle is added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [subtitles.length]);

  if (subtitles.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-600 text-xs italic">
        Waiting for results...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
      {subtitles.map((sub) => (
        <SubtitleCard key={sub.id} item={sub} />
      ))}
      {/* Invisible element to mark the bottom for auto-scrolling */}
      <div ref={bottomRef} />
    </div>
  );
};
