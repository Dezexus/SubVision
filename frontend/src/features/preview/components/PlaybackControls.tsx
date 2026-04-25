import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo, memo } from 'react';
import { Play, Pause, Clock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Volume2 } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { formatTimeDisplay } from '../../../utils/format';
import type { SubtitleItem } from '../../../types';
import { shallow } from 'zustand/shallow';

interface PlaybackControlsProps {
  currentTime: number;
  duration: number;
  subtitles: SubtitleItem[];
  isPlaying: boolean;
  onSeek: (time: number) => void;
  onPlayPause: () => void;
  onStepFrame: (frames: number) => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  onSeekFrame: (frame: number) => void;
  onAddSubtitle: () => void;
}

const SubtitleBlock = memo(({ 
  sub, 
  duration, 
  isActive, 
  onCommitChanges 
}: { 
  sub: SubtitleItem; 
  duration: number; 
  isActive: boolean; 
  onCommitChanges: (id: number, start: number, end: number) => void;
}) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    type: 'start' | 'end' | 'move';
    startX: number;
    startTime: number;
    endTime: number;
  } | null>(null);
  const [localStart, setLocalStart] = useState(sub.start);
  const [localEnd, setLocalEnd] = useState(sub.end);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!isDragging) {
      setLocalStart(sub.start);
      setLocalEnd(sub.end);
    }
  }, [sub.start, sub.end, isDragging]);

  const handleMouseDown = useCallback((e: React.MouseEvent, edge?: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      type: edge || 'move',
      startX: e.clientX,
      startTime: sub.start,
      endTime: sub.end,
    };
    setIsDragging(true);
    document.body.style.cursor = edge ? 'col-resize' : 'grab';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current || !blockRef.current?.parentElement) return;
      const totalWidth = blockRef.current.parentElement.scrollWidth;
      const deltaX = moveEvent.clientX - dragRef.current.startX;
      const deltaTime = (deltaX / totalWidth) * duration;

      if (dragRef.current.type === 'start') {
        setLocalStart(Math.max(0, Math.min(dragRef.current.endTime - 0.1, dragRef.current.startTime + deltaTime)));
      } else if (dragRef.current.type === 'end') {
        setLocalEnd(Math.min(duration, Math.max(dragRef.current.startTime + 0.1, dragRef.current.endTime + deltaTime)));
      } else {
        let newStart = dragRef.current.startTime + deltaTime;
        let newEnd = dragRef.current.endTime + deltaTime;
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd > duration) {
          newStart -= newEnd - duration;
          newEnd = duration;
        }
        setLocalStart(Math.max(0, Math.min(newStart, duration)));
        setLocalEnd(Math.min(duration, Math.max(newEnd, 0)));
      }
    };

    const handleMouseUp = () => {
      if (dragRef.current) {
        onCommitChanges(sub.id, localStart, sub.start !== localStart || sub.end !== localEnd ? localEnd : sub.end);
      }
      dragRef.current = null;
      setIsDragging(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [sub, duration, localStart, localEnd, onCommitChanges]);

  const startPercent = (localStart / duration) * 100;
  const widthPercent = ((localEnd - localStart) / duration) * 100;
  const isEdited = sub.isEdited;

  return (
    <div
      ref={blockRef}
      className={cn(
        "absolute top-5 bottom-2 rounded border flex items-center overflow-hidden transition-colors shadow-sm group",
        isActive
          ? "bg-brand-500/80 border-brand-400 z-10"
          : isEdited
          ? "bg-blue-500/20 border-blue-500/40"
          : "bg-bg-panel border-white/10 hover:bg-bg-panel/80 hover:border-white/20"
      )}
      style={{
        left: `${startPercent}%`,
        width: `${Math.max(widthPercent, 0.1)}%`,
      }}
      onMouseDown={(e) => handleMouseDown(e)}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
        onMouseDown={(e) => handleMouseDown(e, 'start')}
      />
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
        onMouseDown={(e) => handleMouseDown(e, 'end')}
      />
      <span className="text-xs font-medium text-white/90 truncate px-2 select-none pointer-events-none">
        {sub.text}
      </span>
    </div>
  );
});

export const PlaybackControls = ({
  currentTime,
  duration,
  subtitles,
  isPlaying,
  onSeek,
  onPlayPause,
  onStepFrame,
  volume,
  onVolumeChange,
  onSeekFrame,
  onAddSubtitle,
}: PlaybackControlsProps) => {
  const metadata = useAppStore(state => state.metadata, shallow);
  const saveHistory = useAppStore(state => state.saveHistory);
  const updateSubtitle = useAppStore(state => state.updateSubtitle);
  const [zoom, setZoom] = useState(1);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<{ ratio: number; screenX: number } | null>(null);
  const animationFrameRef = useRef<number>();

  const applyZoom = useCallback((newZoomVal: number) => {
    setZoom((prev) => {
      const newZoom = Math.max(1, Math.min(20, newZoomVal));
      if (newZoom === prev) return prev;
      const container = timelineScrollRef.current;
      if (container && duration > 0) {
        const currentTotalWidth = container.clientWidth * prev;
        const playheadX = (currentTime / duration) * currentTotalWidth;
        let screenX = playheadX - container.scrollLeft;
        if (screenX < 0 || screenX > container.clientWidth) {
          screenX = container.clientWidth / 2;
        }
        zoomAnchorRef.current = { ratio: currentTime / duration, screenX };
      }
      return newZoom;
    });
  }, [currentTime, duration]);

  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.5 : 0.5;
      applyZoom(zoom + delta);
    }
  }, [zoom, applyZoom]);

  useEffect(() => {
    const container = timelineScrollRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
    }
    return () => {
      if (container) {
        container.removeEventListener('wheel', handleWheel);
      }
    };
  }, [handleWheel]);

  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    applyZoom(parseFloat(e.target.value));
  }, [applyZoom]);

  useLayoutEffect(() => {
    if (zoomAnchorRef.current && timelineScrollRef.current) {
      const container = timelineScrollRef.current;
      const newTotalWidth = container.clientWidth * zoom;
      const playheadX = zoomAnchorRef.current.ratio * newTotalWidth;
      container.scrollLeft = playheadX - zoomAnchorRef.current.screenX;
      zoomAnchorRef.current = null;
    }
  }, [zoom]);

  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number;
    const updatePlayhead = () => {
      if (playheadRef.current && timelineScrollRef.current && duration > 0) {
        const container = timelineScrollRef.current;
        const totalWidth = container.scrollWidth;
        const video = document.querySelector('video');
        if (video) {
          const time = video.currentTime;
          const percent = (time / duration) * 100;
          playheadRef.current.style.left = `${percent}%`;
        }
      }
      rafId = requestAnimationFrame(updatePlayhead);
    };
    rafId = requestAnimationFrame(updatePlayhead);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, duration]);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const totalWidth = e.currentTarget.scrollWidth;
    const percent = clickX / totalWidth;
    const targetTime = Math.max(0, Math.min(duration, percent * duration));
    onSeek(targetTime);
  }, [duration, onSeek]);

  const memoizedSubtitles = useMemo(() => subtitles.map(sub => ({
    sub,
    isActive: currentTime >= sub.start && currentTime <= sub.end,
  })), [subtitles, currentTime]);

  const handleCommitSubtitleChanges = useCallback((id: number, start: number, end: number) => {
    saveHistory();
    const sub = subtitles.find(s => s.id === id);
    if (sub) {
      updateSubtitle({ ...sub, start, end, isEdited: true });
    }
  }, [saveHistory, updateSubtitle, subtitles]);

  if (!metadata) return null;

  return (
    <div className="flex flex-col w-full bg-bg-panel border-t border-border-main text-txt-main select-none">
      <div className="h-16 px-6 flex items-center border-b border-border-subtle bg-bg-main shadow-sm z-10">
        <div className="flex-1 flex justify-center items-center gap-6">
          <button
            onClick={() => onStepFrame(-1)}
            className="p-2 rounded-full hover:bg-bg-surface text-txt-muted hover:text-white transition-all transform hover:scale-110"
            title="Step backward 1 frame"
          >
            <ChevronLeft size={24} />
          </button>

          <button
            onClick={onPlayPause}
            className="w-14 h-14 flex items-center justify-center rounded-full bg-brand-500 hover:bg-brand-600 text-white shadow-lg transition-all transform hover:scale-105"
            title="Play / Pause"
          >
            {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </button>

          <button
            onClick={() => onStepFrame(1)}
            className="p-2 rounded-full hover:bg-bg-surface text-txt-muted hover:text-white transition-all transform hover:scale-110"
            title="Step forward 1 frame"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="flex-1 flex justify-end items-center gap-4">
          <div className="flex items-center gap-2">
            <Volume2 size={16} className="text-txt-subtle" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              className="w-20 accent-brand-500"
            />
          </div>

          <div className="flex items-center gap-2 bg-bg-surface px-3 py-1.5 rounded-lg">
            <ZoomOut size={16} className="text-txt-subtle" />
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={zoom}
              onChange={handleZoomSlider}
              className="w-24 accent-brand-500"
            />
            <ZoomIn size={16} className="text-txt-subtle" />
          </div>

          <div className="flex items-center gap-2 ml-4">
            <Clock size={16} className="text-txt-subtle" />
            <span className="text-sm font-mono text-txt-muted">
              {metadata.fps.toFixed(2)} FPS
            </span>
          </div>
        </div>
      </div>

      <div
        ref={timelineScrollRef}
        className="relative w-full h-20 overflow-x-auto overflow-y-hidden bg-bg-surface scroll-smooth"
      >
        <div
          className="h-full relative cursor-text min-w-full"
          style={{ width: `${zoom * 100}%` }}
          onClick={handleTimelineClick}
        >
          <div className="absolute top-0 w-full h-5 border-b border-border-main bg-black/20 pointer-events-none" />
          <div className="absolute top-5 left-0 right-0 bottom-2 bg-bg-track/30 rounded border border-white/5 mx-2" />

          {memoizedSubtitles.map(({ sub, isActive }) => (
            <SubtitleBlock
              key={sub.id}
              sub={sub}
              duration={duration}
              isActive={isActive}
              onCommitChanges={handleCommitSubtitleChanges}
            />
          ))}

          <div
            ref={playheadRef}
            className="absolute top-0 bottom-0 z-50 w-px pointer-events-none"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div className="absolute top-0 -left-[5px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
            <div className="absolute top-0 h-full w-px bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>
        </div>
      </div>
    </div>
  );
};