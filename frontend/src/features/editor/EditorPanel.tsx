/**
 * Main editor layout orchestration with global hotkey support for frame navigation.
 */
import React, { useEffect } from 'react';
import { VideoCanvas } from './components/VideoCanvas';
import { FilterPreview } from './components/FilterPreview';
import { WelcomeScreen } from './components/WelcomeScreen';
import { HybridTimeline } from './components/HybridTimeline';
import { useAppStore } from '../../store/useAppStore';

export const EditorPanel = () => {
  const { file, roi, metadata, setCurrentFrame } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setCurrentFrame(f => Math.max(0, f - 1));
      } else if (e.code === 'ArrowRight' && metadata) {
        e.preventDefault();
        setCurrentFrame(f => Math.min(metadata.total_frames - 1, f + 1));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [metadata, setCurrentFrame]);

  if (!file) {
    return (
      <div className="flex-1 m-4 border border-border-main rounded-xl bg-bg-deep overflow-hidden shadow-2xl flex items-center justify-center">
         <WelcomeScreen />
      </div>
    );
  }

  return (
    <div className="flex-1 h-full relative overflow-hidden flex flex-col gap-4">
      <div className="flex-1 relative flex items-center justify-center overflow-hidden mx-4 mt-4 min-h-0">
         <VideoCanvas />
      </div>

      {roi[2] > 0 && (
        <div className="flex-none px-4">
           <FilterPreview />
        </div>
      )}

      <div className="flex-none px-4 pb-4">
         <HybridTimeline />
      </div>
    </div>
  );
};
