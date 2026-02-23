import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, MoveVertical, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { PlaybackControls } from './components/PlaybackControls';
import type { SubtitleItem } from '../../types';

/**
 * Modal component for previewing video playback and editing subtitles.
 * Manages playback state, precise frame stepping, initialization locks,
 * and dynamic subtitle positioning.
 */
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
  const animationFrameRef = useRef<number>();
  const initializedRef = useRef<boolean>(false);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(20);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubtitleItem | null | undefined>(null);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
        if (video.paused) {
            video.play();
        } else {
            video.pause();
        }
    }
  }, []);

  const handleStepFrame = useCallback((frames: number) => {
    const video = videoRef.current;
    if (video && metadata && metadata.fps > 0) {
      if (!video.paused) {
        video.pause();
      }

      const currentFrame = Math.round(video.currentTime * metadata.fps);
      let newTime = (currentFrame + frames) / metadata.fps;
      newTime = Math.max(0, Math.min(video.duration || duration, newTime));

      video.currentTime = newTime + 0.0001;
      setCurrentTime(newTime);
    }
  }, [metadata, duration]);

  const animate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const newTime = video.currentTime;
    setCurrentTime(newTime);

    const currentSub = subtitles.find(s => newTime >= s.start && newTime <= s.end);
    setActiveSub(currentSub);

    animationFrameRef.current = requestAnimationFrame(animate);
  }, [subtitles]);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    setDuration(e.currentTarget.duration);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, animate]);

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
    if (!isPreviewModalOpen) {
      initializedRef.current = false;
      if (videoRef.current) {
        videoRef.current.pause();
      }
      return;
    }

    if (isPreviewModalOpen && metadata && !initializedRef.current && videoRef.current) {
      const initialTime = currentFrameIndex / metadata.fps;
      videoRef.current.currentTime = initialTime;
      setCurrentTime(initialTime);
      initializedRef.current = true;
    }
  }, [isPreviewModalOpen, metadata, currentFrameIndex]);

  useEffect(() => {
    if (!isPlaying) {
      setActiveSub(subtitles.find(s => currentTime >= s.start && currentTime <= s.end));
    }
  }, [subtitles, currentTime, isPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStepFrame(-1);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepFrame(1);
      }
    };

    if (isPreviewModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPreviewModalOpen, handlePlayPause, handleStepFrame]);

  if (!isPreviewModalOpen || !metadata) {
    return null;
  }

  const handleSeek = (time: number) => {
    const video = videoRef.current;
    if (video) {
        video.currentTime = time;
        setCurrentTime(time);
    }
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
      <div className="bg-bg-main rounded-xl border border-border-main shadow-2xl w-[80vw] h-[80vh] flex flex-col overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-border-main flex justify-between items-center bg-bg-panel shrink-0">
          <h2 className="text-white font-bold tracking-wide uppercase text-sm">Playback & Edit</h2>
          <button onClick={() => setPreviewModalOpen(false)} className="p-1.5 text-txt-subtle hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded transition-colors">
            <X size={18} />
          </button>
        </div>

        <div ref={containerRef} className="relative w-full flex-1 bg-black flex items-center justify-center group/video overflow-hidden">
          {videoUrl && (
            <video
              ref={videoRef}
              src={videoUrl}
              autoPlay
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onLoadedMetadata={handleLoadedMetadata}
              onDurationChange={handleLoadedMetadata}
              className="w-full h-full object-contain"
            />
          )}

          {activeSub && (
            <div
              className="absolute w-11/12 max-w-5xl left-1/2 -translate-x-1/2 flex flex-col items-center group/sub"
              style={{ bottom: `${bottomOffset}%` }}
            >
              <div
                className="w-20 h-2.5 mb-1 bg-white/20 hover:bg-brand-500 rounded-full cursor-ns-resize backdrop-blur-sm transition-colors shadow-sm flex items-center justify-center opacity-0 group-hover/video:opacity-100"
                onMouseDown={handleDragStart}
                title="Drag to adjust vertical position"
              >
                <MoveVertical size={12} className="text-white/80 opacity-0 group-hover/sub:opacity-100" />
              </div>

              <div className="relative inline-grid max-w-full group/textarea">
                <span
                  className="col-start-1 row-start-1 invisible whitespace-pre px-16 py-2.5 text-lg md:text-xl min-w-[280px] overflow-hidden"
                  aria-hidden="true"
                >
                  {activeSub.text || ' '}
                </span>
                <input
                  type="text"
                  value={activeSub.text}
                  onFocus={() => saveHistory()}
                  onChange={(e) => updateSubtitle({ ...activeSub, text: e.target.value })}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="col-start-1 row-start-1 w-full bg-black/70 text-white text-center text-lg md:text-xl py-2.5 px-12 rounded-2xl border-2 border-transparent hover:border-white/20 focus:border-brand-500 focus:bg-black/90 focus:outline-none transition-colors shadow-lg backdrop-blur-sm"
                />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSubtitle(activeSub.id);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white hover:bg-red-500/80 rounded-full opacity-0 group-hover/textarea:opacity-100 transition-all"
                  title="Delete Subtitle"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          )}
        </div>

        <PlaybackControls
            currentTime={currentTime}
            duration={duration}
            subtitles={subtitles}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlayPause={handlePlayPause}
            onStepFrame={handleStepFrame}
        />
      </div>
    </div>
  );
};
