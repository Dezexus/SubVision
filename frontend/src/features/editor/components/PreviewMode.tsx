import React, { useRef, useState, useEffect, useCallback } from 'react';
import { MoveVertical, Trash2, Eye, EyeOff, X } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { HybridTimeline } from './HybridTimeline';
import { API_BASE } from '../../../services/api';
import { shallow } from 'zustand/shallow';
import type { SubtitleItem } from '../../../types';

const THROTTLE_INTERVAL = 100;

export const PreviewMode = () => {
  const metadata = useAppStore(s => s.metadata, shallow);
  const file = useAppStore(s => s.file);
  const updateSubtitle = useAppStore(s => s.updateSubtitle);
  const deleteSubtitle = useAppStore(s => s.deleteSubtitle);
  const saveHistory = useAppStore(s => s.saveHistory);
  const subtitles = useAppStore(s => s.subtitles, shallow);
  const setCurrentFrame = useAppStore(s => s.setCurrentFrame);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ y: number; initialOffset: number } | null>(null);
  const animationFrameRef = useRef<number>();
  const lastThrottleTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(20);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubtitleItem | null | undefined>(null);
  const [volume, setVolume] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);

  const [localText, setLocalText] = useState('');
  const prevActiveSubIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeSub && activeSub.id !== prevActiveSubIdRef.current) {
      setLocalText(activeSub.text);
      prevActiveSubIdRef.current = activeSub.id;
    } else if (!activeSub) {
      prevActiveSubIdRef.current = null;
    }
  }, [activeSub]);

  const updateActiveSubtitle = useCallback((time: number) => {
    const subs = subtitles;
    if (subs.length === 0) {
      setActiveSub(null);
      return;
    }
    for (let i = 0; i < subs.length; i++) {
      if (time >= subs[i].start && time <= subs[i].end) {
        setActiveSub(subs[i]);
        return;
      }
    }
    setActiveSub(null);
  }, [subtitles]);

  const syncCurrentFrame = useCallback((time: number) => {
    if (metadata) {
      const frame = Math.round(time * metadata.fps);
      setCurrentFrame(frame);
    }
  }, [metadata, setCurrentFrame]);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) video.play();
      else video.pause();
    }
  }, []);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      }
    };
    videoEl.addEventListener('keydown', onKeyDown);
    return () => videoEl.removeEventListener('keydown', onKeyDown);
  }, [handlePlayPause]);

  useEffect(() => {
    if (isPlaying) {
      const loop = () => {
        const video = videoRef.current;
        if (video) {
          const now = performance.now();
          if (now - lastThrottleTimeRef.current >= THROTTLE_INTERVAL) {
            lastThrottleTimeRef.current = now;
            const time = video.currentTime;
            currentTimeRef.current = time;
            setCurrentTime(time);
            updateActiveSubtitle(time);
            syncCurrentFrame(time);
          }
        }
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      animationFrameRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, updateActiveSubtitle, syncCurrentFrame]);

  useEffect(() => {
    if (metadata) {
      if (file) {
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        return () => URL.revokeObjectURL(url);
      } else {
        const url = `${API_BASE}/api/video/download/${metadata.filename}`;
        setVideoUrl(url);
        return () => setVideoUrl(null);
      }
    }
  }, [file, metadata]);

  const handleStepFrame = useCallback((frames: number) => {
    const video = videoRef.current;
    if (video && metadata && metadata.fps > 0) {
      if (!video.paused) video.pause();
      const currentFrame = Math.round(video.currentTime * metadata.fps);
      let newTime = (currentFrame + frames) / metadata.fps;
      newTime = Math.max(0, Math.min(video.duration || durationRef.current, newTime));
      video.currentTime = newTime + 0.0001;
      setCurrentTime(newTime);
      syncCurrentFrame(newTime);
    }
  }, [metadata, syncCurrentFrame]);

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
      setCurrentTime(time);
      updateActiveSubtitle(time);
      syncCurrentFrame(time);
    }
  }, [updateActiveSubtitle, syncCurrentFrame]);

  const handleVolumeChange = useCallback((newVol: number) => {
    setVolume(Math.min(1, Math.max(0, newVol)));
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const dur = e.currentTarget.duration;
    setDuration(dur);
    durationRef.current = dur;
  }, []);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setLocalText(newText);
    if (activeSub) {
      updateSubtitle({ ...activeSub, text: newText });
    }
  }, [activeSub, updateSubtitle]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
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
  }, [bottomOffset]);

  if (!metadata) return null;

  return (
    <div className="w-full h-full flex flex-col bg-bg-main border border-border-main rounded-xl overflow-hidden shadow-2xl">
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

        {activeSub && showOverlay && (
          <div
            className="absolute w-11/12 max-w-5xl left-1/2 -translate-x-1/2 flex flex-col items-center group/sub"
            style={{ bottom: `${bottomOffset}%` }}
          >
            <button
              onClick={() => setShowOverlay(false)}
              className="absolute -top-8 right-0 p-1 bg-black/60 hover:bg-black/90 text-white/80 rounded-full"
              title="Hide subtitle overlay"
            >
              <X size={14} />
            </button>

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
                {localText || ' '}
              </span>
              <input
                type="text"
                value={localText}
                onFocus={saveHistory}
                onChange={handleTextChange}
                onKeyDown={(e) => e.stopPropagation()}
                className="col-start-1 row-start-1 w-full bg-black/70 text-white text-center text-lg md:text-xl py-2.5 px-12 rounded-2xl border-2 border-transparent hover:border-white/20 focus:border-brand-500 focus:bg-black/90 focus:outline-none transition-colors shadow-lg backdrop-blur-sm"
              />
              <button
                onClick={(e) => { e.stopPropagation(); deleteSubtitle(activeSub.id); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-white/50 hover:text-white hover:bg-red-500/80 rounded-full opacity-0 group-hover/textarea:opacity-100 transition-all"
                title="Delete Subtitle"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        )}

        {!showOverlay && activeSub && (
          <button onClick={() => setShowOverlay(true)} className="absolute top-4 right-4 z-50 p-2 bg-black/60 hover:bg-black/90 text-white/80 rounded-full" title="Show subtitle overlay">
            <Eye size={18} />
          </button>
        )}
      </div>

      <HybridTimeline
        isPlaying={isPlaying}
        onPlayPause={handlePlayPause}
        onStepFrame={handleStepFrame}
        onSeek={handleSeek}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        currentTimeOverride={currentTime}
        durationOverride={duration}
      />
    </div>
  );
};