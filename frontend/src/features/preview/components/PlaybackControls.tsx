import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Play, Pause, Clock, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
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
}

export const PlaybackControls = ({
  currentTime,
  duration,
  subtitles,
  isPlaying,
  onSeek,
  onPlayPause,
  onStepFrame,
}: PlaybackControlsProps) => {
  const metadata = useAppStore((state) => state.metadata);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomAnchorRef = useRef<{ ratio: number, screenX: number } | null>(null);

  const applyZoom = useCallback((newZoomVal: number) => {
    setZoom((prev) => {
      const newZoom = Math.max(1, Math.min(20, newZoomVal));
      if (newZoom === prev) return prev;

      const container = containerRef.current;
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
    const container = containerRef.current;
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
    if (zoomAnchorRef.current && containerRef.current) {
      const container = containerRef.current;
      const newTotalWidth = container.clientWidth * zoom;
      const playheadX = zoomAnchorRef.current.ratio * newTotalWidth;
      container.scrollLeft = playheadX - zoomAnchorRef.current.screenX;
      zoomAnchorRef.current = null;
    }
  }, [zoom]);

  useEffect(() => {
    if (isPlaying && containerRef.current && duration > 0) {
      const container = containerRef.current;
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
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percent = clickX / rect.width;
    const targetTime = Math.max(0, Math.min(duration, percent * duration));
    onSeek(targetTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

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
        ref={containerRef}
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

            return (
              <div
                key={sub.id}
                className={cn(
                  "absolute top-5 bottom-2 rounded border flex items-center overflow-hidden transition-colors shadow-sm",
                  isActive
                    ? "bg-brand-500/80 border-brand-400 z-10"
                    : "bg-bg-panel border-white/10 hover:bg-bg-panel/80 hover:border-white/20"
                )}
                style={{
                  left: `${startPercent}%`,
                  width: `${durationPercent}%`,
                }}
              >
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
