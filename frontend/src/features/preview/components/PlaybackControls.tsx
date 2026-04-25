import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Play, Pause, Clock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Volume2 } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { formatTimeDisplay } from '../../../utils/format';
import type { SubtitleItem } from '../../../types';

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
  const metadata = useAppStore((state) => state.metadata);
  const saveHistory = useAppStore((state) => state.saveHistory);
  const updateSubtitle = useAppStore((state) => state.updateSubtitle);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [dragInfo, setDragInfo] = useState<{
    subId: number;
    type: 'start' | 'end' | 'move';
    startX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);
  const zoomAnchorRef = useRef<{ ratio: number; screenX: number } | null>(null);

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

  const handleZoomSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    applyZoom(parseFloat(e.target.value));
  };

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
    if (isPlaying && timelineScrollRef.current && duration > 0) {
      const container = timelineScrollRef.current;
      const containerWidth = container.clientWidth;
      const totalWidth = containerWidth * zoom;
      const playheadX = (currentTime / duration) * totalWidth;
      const scrollLeft = container.scrollLeft;
      if (playheadX > scrollLeft + containerWidth * 0.85) {
        container.scrollLeft = playheadX - containerWidth * 0.15;
      } else if (playheadX < scrollLeft) {
        container.scrollLeft = playheadX - containerWidth * 0.15;
      }
    }
  }, [currentTime, isPlaying, duration, zoom]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragInfo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const totalWidth = e.currentTarget.scrollWidth;
    const percent = clickX / totalWidth;
    const targetTime = Math.max(0, Math.min(duration, percent * duration));
    onSeek(targetTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const currentFrame = metadata ? Math.round(currentTime * metadata.fps) : 0;

  const handleMouseDownOnBlock = (e: React.MouseEvent, sub: SubtitleItem, edge?: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    const initialSub = { ...sub };
    if (!edge) {
      saveHistory();
    }
    setDragInfo({
      subId: sub.id,
      type: edge || 'move',
      startX: e.clientX,
      initialStart: sub.start,
      initialEnd: sub.end,
    });
    document.body.style.cursor = edge ? 'col-resize' : 'grab';
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragInfoRef.current) return;
      if (!timelineScrollRef.current) return;
      const container = timelineScrollRef.current;
      const totalWidth = container.scrollWidth;
      const deltaX = moveEvent.clientX - dragInfoRef.current.startX;
      const deltaTime = (deltaX / totalWidth) * duration;

      const state = useAppStore.getState();
      const sub = state.subtitles.find(s => s.id === dragInfoRef.current!.subId);
      if (!sub) return;

      let newStart = sub.start;
      let newEnd = sub.end;

      if (dragInfoRef.current.type === 'start') {
        newStart = Math.max(0, Math.min(sub.end - 0.1, dragInfoRef.current.initialStart + deltaTime));
        updateSubtitle({ ...sub, start: newStart });
      } else if (dragInfoRef.current.type === 'end') {
        newEnd = Math.min(duration, Math.max(sub.start + 0.1, dragInfoRef.current.initialEnd + deltaTime));
        updateSubtitle({ ...sub, end: newEnd });
      } else if (dragInfoRef.current.type === 'move') {
        newStart = dragInfoRef.current.initialStart + deltaTime;
        newEnd = dragInfoRef.current.initialEnd + deltaTime;
        if (newStart < 0) {
          newEnd -= newStart;
          newStart = 0;
        }
        if (newEnd > duration) {
          newStart -= newEnd - duration;
          newEnd = duration;
        }
        updateSubtitle({ ...sub, start: Math.max(0, newStart), end: Math.min(duration, newEnd) });
      }
    };

    const handleMouseUp = () => {
      if (dragInfoRef.current) {
        const state = useAppStore.getState();
        const finalSub = state.subtitles.find(s => s.id === dragInfoRef.current!.subId);
        if (finalSub && (
          finalSub.start !== (dragInfoRef.current.initialStart + (dragInfoRef.current.type === 'move' ? (dragInfoRef.current.startX ? 0 : 0) : 0)) ||
          finalSub.end !== (dragInfoRef.current.initialEnd + (dragInfoRef.current.type === 'move' ? 0 : 0))
        )) {
          saveHistory();
        }
      }
      setDragInfo(null);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const dragInfoRef = useRef(dragInfo);
  dragInfoRef.current = dragInfo;

  if (!metadata) return null;

  return (
    <div className="flex flex-col w-full bg-bg-panel border-t border-border-main text-txt-main select-none">
      <div className="h-16 px-6 flex items-center border-b border-border-subtle bg-bg-main shadow-sm z-10">
        <div className="flex-1 flex items-center gap-3 font-mono text-sm">
          <span className="text-white font-bold tracking-wide text-lg">
            {formatTimeDisplay(currentTime)}
          </span>
          <span className="text-txt-subtle text-lg">/</span>
          <span className="text-txt-muted text-lg">
            {formatTimeDisplay(duration)}
          </span>
          <div className="flex items-center gap-2 ml-4">
            <span className="text-[10px] text-txt-subtle">Frame</span>
            <input
              type="number"
              value={currentFrame}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 0 && val <= (metadata?.total_frames || 0)) {
                  onSeekFrame(val);
                }
              }}
              className="w-16 bg-bg-surface border border-border-main text-txt-main text-xs px-2 py-1 rounded focus:outline-none focus:border-brand-500"
              min={0}
              max={metadata.total_frames}
            />
          </div>
        </div>

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

          {subtitles.map((sub) => {
            const startPercent = (sub.start / duration) * 100;
            const durationPercent = ((sub.end - sub.start) / duration) * 100;
            const isActive = currentTime >= sub.start && currentTime <= sub.end;
            const isEdited = sub.isEdited;

            return (
              <div
                key={sub.id}
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
                  width: `${durationPercent}%`,
                }}
                onMouseDown={(e) => handleMouseDownOnBlock(e, sub)}
              >
                <div
                  className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
                  onMouseDown={(e) => handleMouseDownOnBlock(e, sub, 'start')}
                />
                <div
                  className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-white/30 z-10"
                  onMouseDown={(e) => handleMouseDownOnBlock(e, sub, 'end')}
                />
                <span className="text-xs font-medium text-white/90 truncate px-2 select-none pointer-events-none">
                  {sub.text}
                </span>
              </div>
            );
          })}

          <div
            className="absolute top-0 bottom-0 z-50 w-px pointer-events-none"
            style={{ left: `${progressPercent}%` }}
          >
            <div className="absolute top-0 -left-[5px] w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
            <div className="absolute top-0 h-full w-px bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>
        </div>
      </div>
    </div>
  );
};