import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { formatTimeDisplay } from '../../../utils/format';
import { calculateTracks, type ProcessedSubtitle } from '../utils/timelineUtils';
import { useTimelineZoom } from '../hooks/useTimelineZoom';
import { useSubtitleDrag } from '../hooks/useSubtitleDrag';
import { TimelineHeader } from './TimelineHeader';
import { SubtitleClip } from './SubtitleClip';
import { cn } from '../../../utils/cn';

interface TimelineProps {
  isPlaying?: boolean;
  onPlayPause?: () => void;
  onStepFrame?: (frames: number) => void;
  onSeek?: (time: number) => void;
  volume?: number;
  onVolumeChange?: (vol: number) => void;
  currentTimeOverride?: number;
  durationOverride?: number;
  activeEditId?: number | null;
}

export const Timeline: React.FC<TimelineProps> = ({
  isPlaying: isPlayingProp,
  onPlayPause,
  onStepFrame,
  onSeek,
  volume: volumeProp,
  onVolumeChange,
  currentTimeOverride,
  durationOverride,
  activeEditId,
}) => {
  const metadata = useVideoStore((s) => s.metadata);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const setCurrentFrame = useVideoStore((s) => s.setCurrentFrame);
  const subtitles = useProcessingStore((s) => s.subtitles);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [isSnapping, setIsSnapping] = useState(true);
  const [hoveredSub, setHoveredSub] = useState<ProcessedSubtitle | null>(null);
  const [hoverPos, setHoverPos] = useState<number>(0);

  const { zoomLevel, handleZoomButton } = useTimelineZoom(scrollContainerRef);
  const { isDraggingRef, draggedEdge, handleEdgeMouseDown } = useSubtitleDrag(scrollContainerRef, isSnapping);

  const isPreviewMode = isPlayingProp !== undefined;
  const exactDuration = durationOverride ?? (metadata ? metadata.total_frames / metadata.fps : 1);
  const currentTime = currentTimeOverride ?? (metadata ? currentFrameIndex / metadata.fps : 0);
  const progressPercent = (currentTime / exactDuration) * 100;

  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  const processedSubtitles = useMemo(() => calculateTracks(subtitles), [subtitles]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      
      const store = useProcessingStore.getState();
      const currentFps = useVideoStore.getState().metadata?.fps || 25;
      const frameDur = 1 / currentFps;
      const activeSub = store.subtitles.find(s => currentTimeRef.current >= s.start && currentTimeRef.current <= s.end);

      if (e.key.toLowerCase() === 's' && !e.ctrlKey) {
        e.preventDefault();
        setIsSnapping(prev => !prev);
      }

      if (activeSub) {
        if (e.key.toLowerCase() === 'i') {
          e.preventDefault();
          store.updateSubtitle({ ...activeSub, start: Math.min(currentTimeRef.current, activeSub.end - 0.05) });
        } else if (e.key.toLowerCase() === 'o') {
          e.preventDefault();
          store.updateSubtitle({ ...activeSub, end: Math.max(currentTimeRef.current, activeSub.start + 0.05) });
        } else if (e.altKey && e.key === '[') {
          e.preventDefault();
          store.updateSubtitle({ ...activeSub, start: Math.max(0, activeSub.start - frameDur) });
        } else if (e.altKey && e.key === ']') {
          e.preventDefault();
          store.updateSubtitle({ ...activeSub, start: Math.min(activeSub.end - 0.05, activeSub.start + frameDur) });
        } else if (e.ctrlKey && e.key === '[') {
          e.preventDefault();
          store.updateSubtitle({ ...activeSub, end: Math.max(activeSub.start + 0.05, activeSub.end - frameDur) });
        } else if (e.ctrlKey && e.key === ']') {
          e.preventDefault();
          store.updateSubtitle({ ...activeSub, end: activeSub.end + frameDur });
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left + scrollContainerRef.current.scrollLeft) / scrollContainerRef.current.scrollWidth;
    const targetTime = percent * exactDuration;

    if (isPreviewMode && onSeek) onSeek(Math.max(0, Math.min(exactDuration, targetTime)));
    else setCurrentFrame(Math.min(Math.max(0, Math.round(percent * (metadata?.total_frames || 0))), (metadata?.total_frames || 1) - 1));
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setHoverPos(Math.min(Math.max(e.clientX - rect.left, 100), containerRef.current.clientWidth - 100));
  };

  if (!metadata && !isPreviewMode) return null;

  return (
    <div className="bg-bg-main border border-border-main shadow-2xl select-none flex flex-col rounded-xl overflow-hidden">
      <TimelineHeader 
        currentTimeDisplay={formatTimeDisplay(currentTime)}
        totalTimeDisplay={formatTimeDisplay(exactDuration)}
        currentFrame={Math.round(currentTime * (metadata?.fps || 25))}
        isPlaying={!!isPlayingProp}
        isSnapping={isSnapping}
        zoomLevel={zoomLevel}
        volume={volumeProp || 0}
        isPreviewMode={isPreviewMode}
        onPlayPause={onPlayPause}
        onStepFrame={onStepFrame}
        onToggleSnapping={() => setIsSnapping(!isSnapping)}
        onZoom={handleZoomButton}
        onVolumeChange={onVolumeChange}
      />

      <div
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredSub(null)}
        className="relative h-28 bg-bg-track w-full group overflow-hidden"
      >
        <div
          ref={scrollContainerRef}
          className="w-full h-full overflow-x-auto overflow-y-hidden custom-scrollbar relative"
          onClick={handleTimelineClick}
        >
          <div className="h-full relative transition-all duration-75 ease-out" style={{ width: `${zoomLevel * 100}%` }}>
            <div className="absolute top-0 w-full h-4 border-b border-border-main flex justify-between px-[2px] opacity-50">
              {Array.from({ length: 20 * Math.ceil(zoomLevel) }).map((_, i) => (
                <div key={i} className={cn("w-px bg-border-main", i % 10 === 0 ? "h-2 mt-1" : "h-1 mt-2")} />
              ))}
            </div>

            <div className="absolute top-6 w-full h-full pointer-events-none">
              {processedSubtitles.map((sub) => (
                <SubtitleClip 
                  key={sub.id}
                  sub={sub}
                  isActive={currentTime >= sub.start && currentTime <= sub.end}
                  isBeingEdited={activeEditId === sub.id}
                  zoomLevel={zoomLevel}
                  draggedEdge={draggedEdge}
                  exactDuration={exactDuration}
                  onMouseDownEdge={handleEdgeMouseDown}
                  onMouseEnter={() => setHoveredSub(sub)}
                />
              ))}
            </div>

            <div className="absolute top-0 bottom-0 z-10 w-px pointer-events-none transition-all duration-75 ease-linear will-change-left" style={{ left: `${progressPercent}%` }}>
              <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] bg-red-500 rounded-full shadow-md border-[2px] border-bg-track" />
              <div className="absolute top-1.5 h-full w-[1.5px] -left-[0.75px] bg-red-500/80 rounded-full" />
            </div>
          </div>
        </div>

        {hoveredSub && (
          <div className="absolute z-50 bottom-2 pointer-events-none" style={{ left: hoverPos }}>
            <div className="bg-bg-main/95 backdrop-blur border border-border-main p-2 rounded shadow-2xl text-xs -translate-x-1/2 w-48">
              <div className="flex justify-between text-txt-subtle mb-1 font-mono text-[9px] uppercase">
                <span>{formatTimeDisplay(hoveredSub.start)}</span>
                <span className={cn(hoveredSub.conf > 0.8 ? "text-emerald-400" : "text-amber-400")}>{Math.round(hoveredSub.conf * 100)}%</span>
              </div>
              <p className="text-txt-main line-clamp-2">{hoveredSub.text}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};