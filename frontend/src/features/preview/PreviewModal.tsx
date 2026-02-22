/**
 * Modal component providing an interactive playback interface and subtitle editor.
 */
import React, { useRef, useState, useEffect } from 'react';
import { X, MoveVertical, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { API_BASE } from '../../services/api';

export const PreviewModal = () => {
  const isPreviewModalOpen = useAppStore(state => state.isPreviewModalOpen);
  const setPreviewModalOpen = useAppStore(state => state.setPreviewModalOpen);
  const metadata = useAppStore(state => state.metadata);
  const subtitles = useAppStore(state => state.subtitles);
  const updateSubtitle = useAppStore(state => state.updateSubtitle);
  const deleteSubtitle = useAppStore(state => state.deleteSubtitle);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ y: number, initialOffset: number } | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [bottomOffset, setBottomOffset] = useState(10);

  useEffect(() => {
    if (!isPreviewModalOpen && videoRef.current) {
      videoRef.current.pause();
    }
  }, [isPreviewModalOpen]);

  if (!isPreviewModalOpen || !metadata) return null;

  const videoUrl = `${API_BASE}/uploads/${encodeURIComponent(metadata.filename)}`;
  const activeSub = subtitles.find(s => currentTime >= s.start && currentTime <= s.end);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragStartRef.current = {
      y: e.clientY,
      initialOffset: bottomOffset
    };

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
          <button
            onClick={() => setPreviewModalOpen(false)}
            className="p-1.5 text-txt-subtle hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={containerRef} className="relative w-full aspect-video bg-black flex items-center justify-center group/video">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            autoPlay
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
          />

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
                <textarea
                  value={activeSub.text}
                  onChange={(e) => updateSubtitle({ ...activeSub, text: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="w-full bg-black/70 text-white text-center text-lg md:text-xl py-2.5 px-12 rounded-2xl border-2 border-transparent hover:border-white/20 focus:border-brand-500 focus:bg-black/90 focus:outline-none resize-none overflow-hidden transition-all shadow-lg backdrop-blur-sm"
                  rows={2}
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
