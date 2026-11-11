import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { formatRulerTime, layoutTimeline, rulerStep, type ProcessedSubtitle } from '../utils/timelineUtils';
import { useTimelineZoom } from '../hooks/useTimelineZoom';
import { useSubtitleDrag } from '../hooks/useSubtitleDrag';
import { TimelineHeader } from './TimelineHeader';
import { ROW_HEIGHT, SubtitleClip } from './SubtitleClip';
import { cn, countTracks, formatTimeDisplay, subtitleAt, trackColor, trackOf, useGlobalKeydown } from '../../../shared/lib';
import { useTrackLabel } from '../../../hooks/useTrackLabel';
import { useLayoutStore } from '../../../store/layoutStore';
import { ResizeHandle } from '../../../shared/ui';
import { useTranslation } from '../../../i18n';

const RULER_HEIGHT = 26;
const BOTTOM_PAD = 10;
const MIN_ROWS = 2;
const MIN_ROW_HEIGHT = 36;
const MAX_ROW_HEIGHT = 140;
const MAX_AREA_HEIGHT = 560;
const GUTTER_WIDTH = 120;

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

/**
 * Core interactive timeline component handling zooming, scrolling, and track visualization.
 */
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
  const activeTrack = useVideoStore((s) => s.activeTrack);
  const setActiveTrack = useVideoStore((s) => s.setActiveTrack);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const regionCount = useVideoStore((s) => s.rois.length);
  const trackCount = countTracks(regionCount, subtitles);
  const showTrack = trackCount > 1;
  const currentTrack = Math.min(activeTrack, trackCount - 1);
  const label = useTrackLabel();
  const { t } = useTranslation();
  const storedHeight = useLayoutStore((s) => s.timelineHeight);
  const setTimelineHeight = useLayoutStore((s) => s.setTimelineHeight);
  const resizeBase = useRef(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [isSnapping, setIsSnapping] = useState(true);
  const [hoveredSub, setHoveredSub] = useState<ProcessedSubtitle | null>(null);
  // Tooltip anchor: above the hovered clip, relative to the timeline box.
  const [hoverAnchor, setHoverAnchor] = useState({ x: 0, y: 0 });
  const [viewport, setViewport] = useState({ width: 0, scrollLeft: 0 });

  const { zoomLevel, handleZoomButton } = useTimelineZoom(scrollContainerRef);
  const { isDraggingRef, draggedEdge, handleEdgeMouseDown } = useSubtitleDrag(scrollContainerRef, isSnapping);

  const isPreviewMode = isPlayingProp !== undefined;
  const exactDuration = Math.max(durationOverride || (metadata ? metadata.total_frames / metadata.fps : 1), 0.001);
  const currentTime = currentTimeOverride ?? (metadata ? currentFrameIndex / metadata.fps : 0);
  const progressPercent = (currentTime / exactDuration) * 100;

  const currentTimeRef = useRef(currentTime);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);

  // Track the visible width and scroll offset for the ruler and clip labels.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const update = () => setViewport({ width: el.clientWidth, scrollLeft: el.scrollLeft });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [metadata, isPreviewMode]);

  const layout = useMemo(() => layoutTimeline(subtitles, trackCount), [subtitles, trackCount]);
  const rowCount = Math.max(layout.laneCount, MIN_ROWS);
  // Auto height fits the rows; a user height stretches or shrinks them.
  const minArea = RULER_HEIGHT + BOTTOM_PAD + rowCount * MIN_ROW_HEIGHT;
  const autoArea = RULER_HEIGHT + BOTTOM_PAD + rowCount * ROW_HEIGHT;
  const trackAreaHeight = storedHeight === null
    ? autoArea
    : Math.min(Math.max(storedHeight, minArea), Math.max(MAX_AREA_HEIGHT, minArea));
  const rowHeight = Math.min(
    MAX_ROW_HEIGHT,
    Math.max(MIN_ROW_HEIGHT, (trackAreaHeight - RULER_HEIGHT - BOTTOM_PAD) / rowCount),
  );

  const contentWidth = viewport.width * zoomLevel;
  const pxPerSecond = contentWidth / exactDuration;

  // Ruler ticks for the visible range only (long videos at high zoom have thousands).
  const ticks = useMemo(() => {
    if (pxPerSecond <= 0) return [];
    const { major, minor } = rulerStep(pxPerSecond);
    const from = Math.max(0, Math.floor(viewport.scrollLeft / pxPerSecond / minor) * minor);
    const to = Math.min(exactDuration, (viewport.scrollLeft + viewport.width) / pxPerSecond + minor);
    const result: { time: number; major: boolean }[] = [];
    for (let i = Math.round(from / minor); i * minor <= to; i++) {
      const time = i * minor;
      result.push({ time, major: Math.abs(time / major - Math.round(time / major)) < 1e-6 });
    }
    return result;
  }, [pxPerSecond, viewport, exactDuration]);

  useGlobalKeydown((e) => {
    const store = useProcessingStore.getState();
    const currentFps = useVideoStore.getState().metadata?.fps || 25;
    const frameDur = 1 / currentFps;
    // Several tracks can be on screen: hotkeys edit the selected one.
    const activeSub = subtitleAt(store.subtitles, currentTimeRef.current, useVideoStore.getState().activeTrack);

    if (e.key.toLowerCase() === 's' && !e.ctrlKey) {
      e.preventDefault();
      setIsSnapping(prev => !prev);
    }

    if (activeSub) {
      let patch: { start?: number; end?: number } | null = null;
      if (e.key.toLowerCase() === 'i') {
        patch = { start: Math.min(currentTimeRef.current, activeSub.end - 0.05) };
      } else if (e.key.toLowerCase() === 'o') {
        patch = { end: Math.max(currentTimeRef.current, activeSub.start + 0.05) };
      } else if (e.altKey && e.key === '[') {
        patch = { start: Math.max(0, activeSub.start - frameDur) };
      } else if (e.altKey && e.key === ']') {
        patch = { start: Math.min(activeSub.end - 0.05, activeSub.start + frameDur) };
      } else if (e.ctrlKey && e.key === '[') {
        patch = { end: Math.max(activeSub.start + 0.05, activeSub.end - frameDur) };
      } else if (e.ctrlKey && e.key === ']') {
        patch = { end: activeSub.end + frameDur };
      }
      if (patch) {
        e.preventDefault();
        store.saveHistory();
        store.updateSubtitle(activeSub.id, patch);
      }
    }
  });

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDraggingRef.current || !scrollContainerRef.current) return;
    const rect = scrollContainerRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left + scrollContainerRef.current.scrollLeft) / scrollContainerRef.current.scrollWidth;
    const targetTime = percent * exactDuration;

    if (isPreviewMode && onSeek) onSeek(Math.max(0, Math.min(exactDuration, targetTime)));
    else setCurrentFrame(Math.min(Math.max(0, Math.round(percent * (metadata?.total_frames || 0))), (metadata?.total_frames || 1) - 1));
  };

  // Anchor the tooltip just above the hovered clip (x follows the mouse),
  // so it never covers the clip and stays inside the timeline horizontally.
  const updateHoverAnchor = (clientX: number, clip?: HTMLElement) => {
    const root = rootRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const x = Math.min(Math.max(clientX - rect.left, 116), rect.width - 116);
    setHoverAnchor((prev) => ({ x, y: clip ? clip.getBoundingClientRect().top - rect.top : prev.y }));
  };

  if (!metadata && !isPreviewMode) return null;

  return (
    // The outer box has no overflow clip, so the tooltip can sit above the timeline.
    <div ref={rootRef} className="relative">
      <ResizeHandle
        orientation="horizontal"
        className="absolute -top-[11px] inset-x-0 z-20 h-3"
        label={t('layout.resizeTimeline')}
        onResizeStart={() => { resizeBase.current = trackAreaHeight; }}
        // Dragging up makes the timeline taller.
        onResize={(delta) => setTimelineHeight(Math.round(resizeBase.current - delta))}
        onReset={() => setTimelineHeight(null)}
      />
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
          onMouseMove={(e) => hoveredSub && updateHoverAnchor(e.clientX)}
          onMouseLeave={() => setHoveredSub(null)}
          className="relative flex bg-bg-track w-full"
          style={{ height: trackAreaHeight }}
        >
          {showTrack && (
            <div className="shrink-0 border-r border-border-main bg-bg-main/60 flex flex-col" style={{ width: GUTTER_WIDTH }}>
              <div className="shrink-0 border-b border-border-main" style={{ height: RULER_HEIGHT }} />
              {layout.rows.map(({ track, lanes }, i) => {
                const isCurrent = track === currentTrack;
                const count = subtitles.filter((s) => trackOf(s) === track).length;
                return (
                  <button
                    key={track}
                    type="button"
                    onClick={() => setActiveTrack(track)}
                    className={cn(
                      'relative flex items-center gap-1.5 pl-3 pr-2 text-left text-[11px] font-semibold transition-colors',
                      i > 0 && 'border-t border-border-main/70',
                      isCurrent ? 'bg-white/[0.04] text-txt-main' : 'text-txt-subtle hover:text-txt-main hover:bg-white/[0.02]',
                    )}
                    style={{ height: lanes * rowHeight }}
                    title={label(track)}
                  >
                    <span className={cn('absolute left-0 top-1 bottom-1 w-[3px] rounded-r', trackColor(track).bg, !isCurrent && 'opacity-40')} />
                    <span className="truncate flex-1">{label(track)}</span>
                    <span className="font-mono text-[10px] text-txt-dim">{count}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div
            ref={scrollContainerRef}
            className="flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden custom-scrollbar relative"
            onClick={handleTimelineClick}
          >
            <div className="h-full relative" style={{ width: `${zoomLevel * 100}%` }}>
              {/* Ruler */}
              <div className="absolute top-0 inset-x-0 border-b border-border-main bg-bg-main/40" style={{ height: RULER_HEIGHT }}>
                {ticks.map(({ time, major }) => (
                  <div
                    key={time}
                    className="absolute bottom-0"
                    style={{ left: `${(time / exactDuration) * 100}%` }}
                  >
                    <div className={cn('w-px', major ? 'h-2.5 bg-txt-subtle/60' : 'h-1.5 bg-border-strong')} />
                    {major && (
                      <span className="absolute bottom-3 left-1 text-[10px] font-mono text-txt-subtle whitespace-nowrap">
                        {formatRulerTime(time)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Track bands */}
              {layout.rows.map(({ track, firstLane, lanes }, i) => (
                <div
                  key={track}
                  className={cn(
                    'absolute inset-x-0 pointer-events-none',
                    i > 0 && 'border-t border-border-main/70',
                    showTrack && track === currentTrack && 'bg-white/[0.035]',
                  )}
                  style={{ top: RULER_HEIGHT + firstLane * rowHeight, height: lanes * rowHeight }}
                />
              ))}

              <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{ top: RULER_HEIGHT }}>
                {layout.clips.map((sub) => (
                  <SubtitleClip
                    key={sub.id}
                    sub={sub}
                    isActive={currentTime >= sub.start && currentTime <= sub.end}
                    isBeingEdited={activeEditId === sub.id}
                    draggedEdge={draggedEdge}
                    exactDuration={exactDuration}
                    contentWidth={contentWidth}
                    rowHeight={rowHeight}
                    dimmed={showTrack && trackOf(sub) !== currentTrack}
                    onMouseDownEdge={handleEdgeMouseDown}
                    onMouseEnter={(el) => {
                      const r = el.getBoundingClientRect();
                      updateHoverAnchor(r.left + r.width / 2, el);
                      setHoveredSub(sub);
                    }}
                    onMouseLeave={() => setHoveredSub((cur) => (cur?.id === sub.id ? null : cur))}
                  />
                ))}
              </div>

              {/* Playhead */}
              <div className="absolute top-0 bottom-0 z-10 w-px pointer-events-none" style={{ left: `${progressPercent}%` }}>
                <div className="absolute -top-1 -left-[5px] w-[11px] h-[11px] bg-red-500 rounded-full shadow-md border-[2px] border-bg-track" />
                <div className="absolute top-1.5 h-full w-[1.5px] -left-[0.75px] bg-red-500/80 rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {hoveredSub && (
        <div
          className="absolute z-50 pointer-events-none"
          style={{ left: hoverAnchor.x, top: hoverAnchor.y, transform: 'translate(-50%, calc(-100% - 6px))' }}
        >
          <div className="bg-bg-main/95 backdrop-blur border border-border-strong p-2.5 rounded-lg shadow-2xl text-xs w-56">
            <div className="flex items-center gap-2 text-txt-subtle mb-1 font-mono text-[10px] uppercase">
              <span>{formatTimeDisplay(hoveredSub.start)} – {formatTimeDisplay(hoveredSub.end)}</span>
              <span className={cn('ml-auto', hoveredSub.conf > 0.8 ? 'text-emerald-400' : 'text-amber-400')}>{Math.round(hoveredSub.conf * 100)}%</span>
            </div>
            {showTrack && (
              <div className={cn('mb-1 text-[10px] font-semibold', trackColor(trackOf(hoveredSub)).text)}>
                {label(trackOf(hoveredSub))}
              </div>
            )}
            <p className="text-txt-main line-clamp-3">{hoveredSub.text}</p>
          </div>
        </div>
      )}
    </div>
  );
};
