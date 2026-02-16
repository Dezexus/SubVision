// The main layout component that orchestrates the editor's different panels.
import React from 'react';
import { VideoControls } from './components/VideoControls';
import { VideoCanvas } from './components/VideoCanvas';
import { FilterPreview } from './components/FilterPreview';
import { WelcomeScreen } from './components/WelcomeScreen';
import { SubtitleTimeline } from './components/SubtitleTimeline';
import { useAppStore } from '../../store/useAppStore';

export const EditorPanel = () => {
  const { file, roi, subtitles } = useAppStore();

  // If no file is loaded, show the welcome screen
  if (!file) {
    return (
      <div className="flex-1 m-4 border border-[#333333] rounded-xl bg-[#0c0c0c] overflow-hidden shadow-2xl flex items-center justify-center">
         <WelcomeScreen />
      </div>
    );
  }

  // Otherwise, display the main editor layout
  return (
    <div className="flex-1 h-full relative overflow-hidden flex flex-col gap-4">
      {/* 1. Top: Main video canvas area */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden mx-4 mt-4 min-h-0">
         <VideoCanvas />
      </div>

      {/* 2. Middle: Live filter preview, shown only when an ROI is active */}
      {roi[2] > 0 && (
        <div className="flex-none px-4">
           <FilterPreview />
        </div>
      )}

      {/* 3. Middle: Subtitle visualization timeline, shown only if subtitles exist */}
      {subtitles.length > 0 && (
        <div className="flex-none px-4">
          <SubtitleTimeline />
        </div>
      )}

      {/* 4. Bottom: Frame navigation controls */}
      <div className="flex-none px-4 pb-4">
         <VideoControls />
      </div>
    </div>
  );
};
