import React from 'react';
import { VideoControls } from './components/VideoControls';
import { VideoCanvas } from './components/VideoCanvas';
import { FilterPreview } from './components/FilterPreview';
import { WelcomeScreen } from './components/WelcomeScreen';
import { useAppStore } from '../../store/useAppStore';

export const EditorPanel = () => {
  const { file, roi } = useAppStore();

  return (
    <div className="flex-1 h-full relative overflow-hidden flex flex-col gap-4"> 

      {file ? (
        <>
          {/* 1. Top: Canvas Area (Flex Grow) */}
          <div className="flex-1 relative flex items-center justify-center overflow-hidden mx-4 mt-4 min-h-0">
             <VideoCanvas />
          </div>

          {/* 2. Middle: Filter Preview (Above timeline) */}
          {roi[2] > 0 && (
            <div className="flex-none px-4">
               <FilterPreview />
            </div>
          )}

          {/* 3. Bottom: Timeline Controls */}
          <div className="flex-none px-4 pb-4">
             <VideoControls />
          </div>
        </>
      ) : (
        <div className="flex-1 m-4 border border-[#333333] rounded-xl bg-[#0c0c0c] overflow-hidden shadow-2xl flex items-center justify-center">
           <WelcomeScreen />
        </div>
      )}
    </div>
  );
};
