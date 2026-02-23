/**
 * Modal component providing an interactive playback interface and subtitle editor.
 * This version uses a local Blob URL and a single-line input for subtitles.
 */
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { X, MoveVertical, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export const PreviewModal = () => {
  const {
    file,
    metadata,
    subtitles,
    currentFrameIndex,
    isPreviewModalOpen,
    setPreviewModalOpen,
    updateSubtitle,
    deleteSubtitle,
    saveHistory
  } = useAppStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ y: number, initialOffset: number } | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [bottomOffset, setBottomOffset] = useState(10);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const activeSub = useMemo(() => {
    return subtitles.find(s => currentTime >= s.start && currentTime <= s.end);
  }, [currentTime, subtitles]);

  useEffect(() => {
    if (file && isPreviewModalOpen) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);

      return () => {
        URL.revokeObjectURL(url);
        setVideoUrl(null);
      };
    }
  }, [file, isPreviewModalOpen]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && isPreviewModalOpen && metadata) {
        video.currentTime = currentFrameIndex / metadata.fps;
    } else if (video && !isPreviewModalOpen) {
        video.pause();
    }
  }, [isPreviewModalOpen, metadata, currentFrameIndex]);

  if (!isPreviewModalOpen || !metadata) {
    return null;
  }

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    setCurrentTime(e.currentTarget.currentTime);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = { y: e.clientY, initialOffset: bottomOffset };
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current || !dragStartRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaY = moveEvent.clientY - dragStartRef.current.y;
      const deltaPercent = (deltaY / rect.height) * 100;
      let newPercent = dragStartRef.current.initialOffset - deltaPercent;
      newPercent = Math.max(2, Math.min(newPercent, 90));
      setBottomOffset(newPercent);
    };
    const handleMouseUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 md:p-8 backdrop-blur-md transition-opacity">
      <div className="bg-bg-main rounded-xl border border-border-main shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-border-main flex justify-between items-center bg-bg-panel">
          <h2 className="text-white font-bold tracking-wide uppercase text-sm">Playback & Edit</h2>
          <button onClick={() => setPreviewModalOpen(false)} className="p-1.5 text-txt-subtle hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        <div ref={containerRef} className="relative w-full aspect-video bg-black flex items-center justify-center group/video">
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              autoPlay
              className="w-full h-full object-contain"
              onTimeUpdate={handleTimeUpdate}
            />
          )}

          {activeSub && (
            <div
              className="absolute w-3/4 max-w-3xl left-1/2 -translate-x-1/2 flex flex-col items-center group/sub"
              style={{ bottom: `${bottomOffset}%` }}
            >
              <div
                className="w-20 h-2.5 mb-1 bg-white/20 hover:bg-brand-500 rounded-full cursor-ns-resize backdrop-blur-sm transition-colors shadow-sm flex items-center justify-center opacity-0 group-hover/video:opacity-100"
                onMouseDown={handleDragStart}
                title="Drag to adjust vertical position"
              >
                <MoveVertical size={12} className="text-white/80 opacity-0 group-hover/sub:opacity-100" />
              </div>

              <div className="w-full relative group/textarea">
                <input
                  type="text"
                  value={activeSub.text}
                  onFocus={() => saveHistory()}
                  onChange={(e) => updateSubtitle({ ...activeSub, text: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full bg-black/70 text-white text-center text-lg md:text-xl py-2.5 px-12 rounded-2xl border-2 border-transparent hover:border-white/20 focus:border-brand-500 focus:bg-black/90 focus:outline-none transition-all shadow-lg backdrop-blur-sm"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSubtitle(activeSub.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white hover:bg-red-500/80 rounded-full opacity-0 group-hover/textarea:opacity-100 transition-all"
                  title="Delete Subtitle"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
