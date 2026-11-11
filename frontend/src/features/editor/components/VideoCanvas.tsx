import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { useShallow } from 'zustand/react/shallow';
import 'react-image-crop/dist/ReactCrop.css';
import { useVideoStore } from '../../../store/videoStore';
import { settingsForTrack, useBlurStore } from '../../../store/blurStore';
import { useProcessingStore } from '../../../store/processingStore';
import { Loader2, ImageOff, Eye, EyeOff, Move, AlertTriangle } from 'lucide-react';
import { useVideoFrame } from '../hooks/useVideoFrame';
import { calculateTextRect, PLACEHOLDER_TEXT } from '../../../shared/lib/textGeometry';
import { cn, countTracks, subtitleAt, trackColor, trackOf } from '../../../shared/lib';
import { useTranslation } from '../../../i18n';
import { useTrackLabel } from '../../../hooks/useTrackLabel';
import type { Roi, VideoMetadata } from '../../../types';

type Rect = { x: number; y: number; w: number; h: number };


function toCss(rect: Rect, metadata: VideoMetadata): React.CSSProperties {
  return {
    left: `${(rect.x / metadata.width) * 100}%`,
    top: `${(rect.y / metadata.height) * 100}%`,
    width: `${(rect.w / metadata.width) * 100}%`,
    height: `${(rect.h / metadata.height) * 100}%`,
  };
}

/** Stored ROI (video pixels) → ReactCrop selection in percent. */
function roiToCrop(roi: Roi | undefined, metadata: VideoMetadata | null): Crop | undefined {
  if (!roi || !metadata || roi[2] <= 0 || roi[3] <= 0) return undefined;
  const [x, y, w, h] = roi;
  return {
    unit: '%',
    x: (x / metadata.width) * 100,
    y: (y / metadata.height) * 100,
    width: (w / metadata.width) * 100,
    height: (h / metadata.height) * 100,
  };
}

export const VideoCanvas = () => {
  const { t } = useTranslation();
  const label = useTrackLabel();
  const file = useVideoStore((s) => s.file);
  const metadata = useVideoStore((s) => s.metadata);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const rois = useVideoStore((s) => s.rois);
  const activeTrack = useVideoStore((s) => s.activeTrack);
  const setRoi = useVideoStore((s) => s.setRoi);
  const setActiveTrack = useVideoStore((s) => s.setActiveTrack);
  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const blurState = useBlurStore(
    useShallow((s) => ({ trackSettings: s.trackSettings, defaultBlurSettings: s.defaultBlurSettings })),
  );
  const setTrackSettings = useBlurStore((s) => s.setTrackSettings);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const blurPreviewUrl = useBlurStore((s) => s.blurPreviewUrl);

  const [crop, setCrop] = useState<Crop | undefined>(() => roiToCrop(rois[activeTrack], metadata));
  const [showGuides, setShowGuides] = useState(true);
  const [dragTrack, setDragTrack] = useState<number | null>(null);
  // Pointer position and the zone's settings when the drag started.
  const dragStart = useRef({ clientX: 0, clientY: 0, y: 0, xOffset: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Show the stored box of the active region whenever the region or file changes.
  const [cropSource, setCropSource] = useState({ file, activeTrack });
  if (cropSource.file !== file || cropSource.activeTrack !== activeTrack) {
    setCropSource({ file, activeTrack });
    setCrop(file !== cropSource.file ? undefined : roiToCrop(rois[activeTrack], metadata));
  }

  const aspectRatio = useMemo(() => {
    if (!metadata) return 16 / 9;
    return metadata.width / metadata.height;
  }, [metadata]);

  const { imgSrc, isLoading, error } = useVideoFrame(metadata, currentFrameIndex);

  const onCropComplete = (pixelCrop: PixelCrop) => {
    if (!imgRef.current || !metadata) return;
    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    setRoi([
      Math.round(pixelCrop.x * scaleX),
      Math.round(pixelCrop.y * scaleY),
      Math.round(pixelCrop.width * scaleX),
      Math.round(pixelCrop.height * scaleY),
    ]);
  };

  const trackCount = countTracks(rois.length, subtitles);

  // Every track's zone is always shown, since the render removes all of
  // them: the cue on screen, or a placeholder of typical size.
  const guides = useMemo(() => {
    if (!isBlurMode || !metadata) return [];
    const time = currentFrameIndex / metadata.fps;
    const result: { track: number; rect: Rect; y: number; xOffset: number; idle: boolean }[] = [];
    for (let track = 0; track < trackCount; track++) {
      const cue = subtitleAt(subtitles.filter((s) => trackOf(s) === track), time);
      const settings = settingsForTrack(blurState, track);
      const rect = calculateTextRect(cue?.text ?? PLACEHOLDER_TEXT, metadata.width, metadata.height, settings);
      result.push({ track, rect, y: settings.y, xOffset: settings.x_offset ?? 0, idle: !cue });
    }
    return result;
  }, [isBlurMode, metadata, currentFrameIndex, trackCount, subtitles, blurState]);

  const handleGuideMouseDown = useCallback((e: React.MouseEvent, track: number, y: number, xOffset: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveTrack(track);
    setDragTrack(track);
    dragStart.current = { clientX: e.clientX, clientY: e.clientY, y, xOffset };
  }, [setActiveTrack]);

  useEffect(() => {
    if (dragTrack === null || !metadata) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const start = dragStart.current;
      let dx = (e.clientX - start.clientX) * (metadata.width / rect.width);
      let dy = (e.clientY - start.clientY) * (metadata.height / rect.height);
      // Shift keeps the move on the dominant axis.
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const half = Math.round(metadata.width / 2);
      setTrackSettings(dragTrack, {
        y: Math.max(0, Math.min(metadata.height, Math.round(start.y + dy))),
        x_offset: Math.max(-half, Math.min(half, Math.round(start.xOffset + dx))),
      });
    };
    const handleMouseUp = () => setDragTrack(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseleave', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [dragTrack, metadata, setTrackSettings]);

  if (!file && !metadata) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-txt-subtle">
        <ImageOff size={48} className="mb-4 opacity-20" />
        <p className="text-sm">{t('editor.uploadPrompt')}</p>
      </div>
    );
  }

  const otherRegions = metadata
    ? rois
        .map((roi, track) => ({ roi, track }))
        .filter(({ roi, track }) => track !== activeTrack && roi[2] > 0 && roi[3] > 0)
    : [];
  const showRegionLabels = rois.length > 1;

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div
        ref={containerRef}
        className="relative shadow-2xl shadow-black/50 border border-border-main rounded-xl overflow-hidden bg-black group/canvas select-none"
        style={{ aspectRatio, maxHeight: '100%', maxWidth: '100%' }}
      >
        {error && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30 gap-3">
            <AlertTriangle size={32} className="text-red-400" />
            <p className="text-red-300 text-sm px-4 text-center">{error}</p>
          </div>
        )}
        {isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20 backdrop-blur-[2px]">
            <Loader2 className="animate-spin text-brand-500" size={32} />
          </div>
        )}
        {imgSrc && !error && (
          <>
            {isBlurMode && (
              <button
                onClick={() => setShowGuides(!showGuides)}
                title={t('editor.toggleGuides')}
                className="absolute top-4 right-4 z-50 p-2 bg-black/60 hover:bg-black/90 text-white/80 hover:text-white rounded-full transition-all border border-white/10 shadow-lg backdrop-blur-sm"
              >
                {showGuides ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            )}
            {!isBlurMode && (
              <>
                <ReactCrop
                  crop={crop}
                  onChange={(_pixel, percent) => setCrop(percent)}
                  onComplete={onCropComplete}
                  className="w-full h-full block"
                >
                  <img
                    ref={imgRef}
                    src={imgSrc}
                    alt={t('editor.frameAlt')}
                    className="w-full h-full object-contain select-none block"
                    onDragStart={(e) => e.preventDefault()}
                  />
                </ReactCrop>
                {metadata && otherRegions.map(({ roi, track }) => (
                  <button
                    key={track}
                    type="button"
                    onClick={() => setActiveTrack(track)}
                    className={cn('absolute z-10 border-2 border-dashed opacity-70 hover:opacity-100 transition-opacity', trackColor(track).border, trackColor(track).soft)}
                    style={toCss({ x: roi[0], y: roi[1], w: roi[2], h: roi[3] }, metadata)}
                    title={label(track)}
                  >
                    <span className={cn('absolute -top-px -left-px px-1.5 text-[11px] font-bold text-black', trackColor(track).bg)}>
                      {track + 1}
                    </span>
                  </button>
                ))}
                {metadata && showRegionLabels && crop && (
                  <span
                    className={cn('absolute z-10 px-1.5 text-[11px] font-bold text-black pointer-events-none', trackColor(activeTrack).bg)}
                    style={{ left: `${crop.x}%`, top: `${crop.y}%` }}
                  >
                    {activeTrack + 1}
                  </span>
                )}
              </>
            )}
            {isBlurMode && metadata && (
              <div className="relative w-full h-full">
                <img
                  src={blurPreviewUrl || imgSrc}
                  alt={t('editor.frameAlt')}
                  className="w-full h-full object-contain select-none block"
                  onDragStart={(e) => e.preventDefault()}
                />
                {showGuides && guides.map(({ track, rect, y, xOffset, idle }) => (
                  <div
                    key={track}
                    className={cn(
                      'absolute z-40 border cursor-grab active:cursor-grabbing group/green',
                      // Current track: green. Other tracks: their color. No cue on screen: dashed.
                      track === activeTrack ? 'bg-green-500/10 border-green-500/90' : cn('bg-white/5', trackColor(track).border),
                      idle && 'border-dashed opacity-70',
                    )}
                    style={toCss(rect, metadata)}
                    onMouseDown={(e) => handleGuideMouseDown(e, track, y, xOffset)}
                    title={t('editor.dragY')}
                  >
                    {trackCount > 1 && (
                      <span className={cn('absolute -top-px -left-px px-1 text-[10px] font-bold text-black', trackColor(track).bg)}>
                        {track + 1}
                      </span>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/green:opacity-100 transition-opacity">
                      <Move size={16} className="text-green-400 drop-shadow-md" />
                    </div>
                  </div>
                ))}
                {dragTrack !== null && (
                  <div className="absolute top-4 left-4 bg-black/80 text-white text-xs px-2 py-1 rounded border border-white/20 z-50 font-mono">
                    X: {settingsForTrack(blurState, dragTrack).x_offset ?? 0} · Y: {settingsForTrack(blurState, dragTrack).y}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
