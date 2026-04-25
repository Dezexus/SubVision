import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, MoveVertical, Trash2, Eye, EyeOff, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { PlaybackControls } from '../../preview/components/PlaybackControls';
import { API_BASE } from '../../../services/api';
import { formatTimeDisplay } from '../../../utils/format';
import { shallow } from 'zustand/shallow';
import type { SubtitleItem } from '../../../types';

const generateNewSubtitle = (start: number, end: number, maxId: number): SubtitleItem => ({
  id: maxId + 1,
  start,
  end,
  text: '',
  conf: 1.0,
  isEdited: true,
});

const THROTTLE_INTERVAL = 100;

export const PreviewMode = () => {
  const metadata = useAppStore(s => s.metadata, shallow);
  const file = useAppStore(s => s.file);
  const setPreviewMode = useAppStore(s => s.setPreviewMode);
  const updateSubtitle = useAppStore(s => s.updateSubtitle);
  const deleteSubtitle = useAppStore(s => s.deleteSubtitle);
  const saveHistory = useAppStore(s => s.saveHistory);
  const addSubtitle = useAppStore(s => s.addSubtitle);
  const subtitles = useAppStore(s => s.subtitles, shallow);
  const undo = useAppStore(s => s.undo);
  const redo = useAppStore(s => s.redo);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ y: number; initialOffset: number } | null>(null);
  const animationFrameRef = useRef<number>();
  const initializedRef = useRef<boolean>(false);
  const activeSubIndexRef = useRef<number>(-1);
  const lastThrottleTimeRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const timestampDisplayRef = useRef<HTMLSpanElement>(null);
  const frameInputRef = useRef<HTMLInputElement>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [bottomOffset, setBottomOffset] = useState(20);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubtitleItem | null | undefined>(null);
  const [volume, setVolume] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);

  useEffect(() => {
    activeSubIndexRef.current = -1;
  }, [subtitles]);

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) video.play();
      else video.pause();
    }
  }, []);

  const handleStepFrame = useCallback((frames: number) => {
    const video = videoRef.current;
    if (video && metadata && metadata.fps > 0) {
      if (!video.paused) video.pause();
      const currentFrame = Math.round(video.currentTime * metadata.fps);
      let newTime = (currentFrame + frames) / metadata.fps;
      newTime = Math.max(0, Math.min(video.duration || durationRef.current, newTime));
      video.currentTime = newTime + 0.0001;
      setCurrentTime(newTime);
    }
  }, [metadata]);

  const updateActiveSubtitle = useCallback((time: number) => {
    const subs = subtitles;
    if (subs.length === 0) {
      setActiveSub(null);
      return;
    }
    let idx = activeSubIndexRef.current;
    if (idx >= subs.length) idx = subs.length - 1;
    if (idx < 0) idx = 0;
    if (subs[idx] && time >= subs[idx].start && time <= subs[idx].end) {
      setActiveSub(subs[idx]);
      activeSubIndexRef.current = idx;
      return;
    }
    for (let i = 0; i < subs.length; i++) {
      if (time >= subs[i].start && time <= subs[i].end) {
        setActiveSub(subs[i]);
        activeSubIndexRef.current = i;
        return;
      }
    }
    setActiveSub(null);
  }, [subtitles]);

  const animate = useCallback(function loop() {
    const video = videoRef.current;
    if (!video) return;
    const now = performance.now();
    const newTime = video.currentTime;
    currentTimeRef.current = newTime;
    if (now - lastThrottleTimeRef.current >= THROTTLE_INTERVAL) {
      lastThrottleTimeRef.current = now;
      setCurrentTime(newTime);
      updateActiveSubtitle(newTime);
    }
    if (timestampDisplayRef.current) {
      timestampDisplayRef.current.textContent = formatTimeDisplay(newTime);
    }
    if (frameInputRef.current && metadata) {
      const frame = Math.round(newTime * metadata.fps);
      frameInputRef.current.value = frame.toString();
    }
    animationFrameRef.current = requestAnimationFrame(loop);
  }, [updateActiveSubtitle, metadata]);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const dur = e.currentTarget.duration;
    setDuration(dur);
    durationRef.current = dur;
  }, []);

  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isPlaying, animate]);

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
    } else {
      setVideoUrl(null);
    }
    return () => {};
  }, [file, metadata]);

  useEffect(() => {
    if (!metadata) return;
    if (!initializedRef.current && videoRef.current) {
      videoRef.current.currentTime = 0; // start from beginning
      setCurrentTime(0);
      initializedRef.current = true;
    }
    return () => {
      initializedRef.current = false;
    };
  }, [metadata]);

  useEffect(() => {
    if (!isPlaying) updateActiveSubtitle(currentTime);
  }, [subtitles, currentTime, isPlaying, updateActiveSubtitle]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = volume;
  }, [volume]);

  const handleSeek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
      setCurrentTime(time);
      updateActiveSubtitle(time);
    }
  }, [updateActiveSubtitle]);

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

  const handlePrevSub = useCallback(() => {
    const subs = subtitles;
    if (subs.length === 0) return;
    const index = subs.findIndex(s => s.start >= currentTime - 0.001);
    const prevIdx = index > 0 ? index - 1 : subs.length - 1;
    handleSeek(subs[prevIdx].start);
  }, [subtitles, currentTime, handleSeek]);

  const handleNextSub = useCallback(() => {
    const subs = subtitles;
    if (subs.length === 0) return;
    const index = subs.findIndex(s => s.start > currentTime);
    const nextIdx = index >= 0 ? index : 0;
    handleSeek(subs[nextIdx].start);
  }, [subtitles, currentTime, handleSeek]);

  const handleAddSubtitle = useCallback(() => {
    const maxId = subtitles.reduce((max, s) => Math.max(max, s.id), 0);
    const start = currentTime;
    const end = Math.min(durationRef.current, start + 2);
    const newSub = generateNewSubtitle(start, end, maxId);
    addSubtitle(newSub);
    saveHistory();
  }, [subtitles, currentTime, addSubtitle, saveHistory]);

  const handleDeleteCurrentSub = useCallback(() => {
    if (activeSub) deleteSubtitle(activeSub.id);
  }, [activeSub, deleteSubtitle]);

  const handleVolumeChange = useCallback((newVol: number) => {
    setVolume(Math.min(1, Math.max(0, newVol)));
  }, []);

  const handleSeekFrame = useCallback((frame: number) => {
    if (metadata && metadata.fps > 0) {
      const time = frame / metadata.fps;
      handleSeek(Math.max(0, Math.min(durationRef.current, time)));
    }
  }, [metadata, handleSeek]);

  const handleClose = useCallback(() => {
    setPreviewMode(false);
  }, [setPreviewMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
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
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!activeSub) return;
        e.preventDefault();
        handleDeleteCurrentSub();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setShowOverlay(prev => !prev);
      } else if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        handleAddSubtitle();
      } else if (e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        if (e.key === 'ArrowUp') handlePrevSub();
        else handleNextSub();
      } else if (e.key === 'Escape') {
        handleClose();
      } else if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleStepFrame, activeSub, handleDeleteCurrentSub, handleAddSubtitle, handlePrevSub, handleNextSub, handleClose, undo, redo]);

  if (!metadata) return null;

  const activeStartFrame = metadata ? Math.round(activeSub ? activeSub.start * metadata.fps : 0) : 0;
  const activeEndFrame = metadata ? Math.round(activeSub ? activeSub.end * metadata.fps : 0) : 0;

  return (
    <div className="w-full h-full flex flex-col bg-bg-main border border-border-main rounded-xl overflow-hidden shadow-2xl">
      <div className="p-3 border-b border-border-main flex justify-between items-center bg-bg-panel shrink-0">
        <h2 className="text-white font-bold tracking-wide uppercase text-sm">Preview & Edit</h2>
        <div className="flex items-center gap-2">
          <button onClick={handlePrevSub} className="p-1.5 text-txt-subtle hover:text-white hover:bg-white/10 rounded" title="Previous subtitle">
            <ChevronUp size={16} />
          </button>
          <button onClick={handleNextSub} className="p-1.5 text-txt-subtle hover:text-white hover:bg-white/10 rounded" title="Next subtitle">
            <ChevronDown size={16} />
          </button>
          <button onClick={handleAddSubtitle} className="p-1.5 text-txt-subtle hover:text-white hover:bg-brand-500 hover:border-brand-500 border border-transparent rounded" title="Add subtitle (Ctrl+N)">
            <Plus size={16} />
          </button>
          <button onClick={handleClose} className="p-1.5 text-txt-subtle hover:text-white hover:bg-red-500/20 hover:border-red-500/50 border border-transparent rounded transition-colors">
            <X size={18} />
          </button>
        </div>
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

        {activeSub && showOverlay && (
          <div
            className="absolute w-11/12 max-w-5xl left-1/2 -translate-x-1/2 flex flex-col items-center group/sub"
            style={{ bottom: `${bottomOffset}%` }}
          >
            <div className="bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-t flex items-center gap-2 mb-0.5">
              <span>{formatTimeDisplay(activeSub.start)} – {formatTimeDisplay(activeSub.end)}</span>
              <span className="opacity-50">|</span>
              <span>Frames: {activeStartFrame} – {activeEndFrame}</span>
              <button
                onClick={() => setShowOverlay(false)}
                className="ml-1 p-0.5 hover:text-brand-400"
                title="Hide subtitle overlay"
              >
                <EyeOff size={12} />
              </button>
            </div>

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

        {!showOverlay && activeSub && (
          <button
            onClick={() => setShowOverlay(true)}
            className="absolute top-4 right-4 z-50 p-2 bg-black/60 hover:bg-black/90 text-white/80 rounded-full"
            title="Show subtitle overlay"
          >
            <Eye size={18} />
          </button>
        )}
      </div>

      <div className="h-16 px-6 flex items-center border-b border-border-subtle bg-bg-main shrink-0">
        <div className="flex-1 flex items-center gap-3 font-mono text-sm">
          <span ref={timestampDisplayRef} className="text-white font-bold tracking-wide text-lg">
            {formatTimeDisplay(currentTime)}
          </span>
          <span className="text-txt-subtle text-lg">/</span>
          <span className="text-txt-muted text-lg">
            {formatTimeDisplay(duration)}
          </span>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-[10px] text-txt-subtle">Frame</span>
            <input
              ref={frameInputRef}
              type="number"
              defaultValue={Math.round(currentTime * metadata.fps)}
              onBlur={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) handleSeekFrame(val);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = parseInt((e.target as HTMLInputElement).value, 10);
                  if (!isNaN(val)) handleSeekFrame(val);
                }
              }}
              className="w-16 bg-bg-surface border border-border-main text-txt-main text-xs px-2 py-1 rounded focus:outline-none focus:border-brand-500"
              min={0}
              max={metadata.total_frames}
            />
          </div>
        </div>
      </div>

      <PlaybackControls
        currentTime={currentTime}
        duration={duration}
        subtitles={subtitles}
        isPlaying={isPlaying}
        onSeek={handleSeek}
        onPlayPause={handlePlayPause}
        onStepFrame={handleStepFrame}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        onSeekFrame={handleSeekFrame}
        onAddSubtitle={handleAddSubtitle}
      />
    </div>
  );
};