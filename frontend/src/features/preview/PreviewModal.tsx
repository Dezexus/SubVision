import React, { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { API_BASE } from '../../services/api';

export const PreviewModal = () => {
  const isPreviewModalOpen = useAppStore(state => state.isPreviewModalOpen);
  const setPreviewModalOpen = useAppStore(state => state.setPreviewModalOpen);
  const metadata = useAppStore(state => state.metadata);
  const subtitles = useAppStore(state => state.subtitles);
  const updateSubtitle = useAppStore(state => state.updateSubtitle);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);

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

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 md:p-8 backdrop-blur-md transition-opacity">
      <div className="bg-[#1e1e1e] rounded-xl border border-[#333333] shadow-2xl w-full max-w-6xl flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">

        <div className="p-4 border-b border-[#333333] flex justify-between items-center bg-[#252526]">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-bold tracking-wide uppercase text-sm">Playback & Edit</h2>
            <span className="text-xs text-[#858585] font-mono px-2 py-0.5 bg-[#18181b] rounded border border-[#333333]">
              {metadata.filename}
            </span>
          </div>
          <button
            onClick={() => setPreviewModalOpen(false)}
            className="p-1.5 text-[#858585] hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative w-full aspect-video bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            autoPlay
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
          />

          {activeSub && (
            <div className="absolute bottom-20 w-3/4 max-w-3xl left-1/2 -translate-x-1/2 group">
              <div className="absolute -top-6 left-0 text-[10px] font-mono text-[#007acc] bg-black/60 px-2 py-1 rounded-t opacity-0 group-hover:opacity-100 transition-opacity">
                Editing Subtitle #{activeSub.id}
              </div>
              <textarea
                value={activeSub.text}
                onChange={(e) => updateSubtitle({ ...activeSub, text: e.target.value })}
                onKeyDown={(e) => e.stopPropagation()}
                className="w-full bg-black/70 text-white text-center text-xl md:text-2xl p-4 rounded-b rounded-tr border-2 border-transparent hover:border-white/20 focus:border-[#007acc] focus:bg-black/90 focus:outline-none resize-none overflow-hidden transition-all shadow-lg backdrop-blur-sm"
                rows={2}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
