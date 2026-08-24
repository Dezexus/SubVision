import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useVideoStore } from '../../../store/videoStore';
import { useBlurStore } from '../../../store/blurStore';
import { useProcessingStore } from '../../../store/processingStore';
import { Loader2, ImageOff, Eye, EyeOff, MoveVertical, AlertTriangle } from 'lucide-react';
import { useVideoFrame } from '../hooks/useVideoFrame';
import { calculateTextRect } from '../../../shared/lib/textGeometry';

export const VideoCanvas = () => {
  const file = useVideoStore((s) => s.file);
  const metadata = useVideoStore((s) => s.metadata);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const setRoi = useVideoStore((s) => s.setRoi);
  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const blurSettings = useBlurStore((s) => s.blurSettings);
  const setBlurSettings = useBlurStore((s) => s.setBlurSettings);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const blurPreviewUrl = useBlurStore((s) => s.blurPreviewUrl);

  const [crop, setCrop] = useState<Crop>();
  const [showGuides, setShowGuides] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartYSetting = useRef(0);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [prevFile, setPrevFile] = useState(file);
  if (file !== prevFile) {
    setPrevFile(file);
    setCrop(undefined);
  }

  const aspectRatio = useMemo(() => {
    if (!metadata) return 16 / 9;
    return metadata.width / metadata.height;
  }, [metadata]);

  const { imgSrc, isLoading, error } = useVideoFrame(metadata, currentFrameIndex);

  const onCropComplete = (crop: PixelCrop) => {
    if (!imgRef.current || !metadata) return;
    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const realX = Math.round(crop.x * scaleX);
    const realY = Math.round(crop.y * scaleY);
    const realW = Math.round(crop.width * scaleX);
    const realH = Math.round(crop.height * scaleY);
    setRoi([realX, realY, realW, realH]);
  };

  const activeSubtitle = useMemo(() => {
    if (!isBlurMode || !metadata) return null;
    const currentTime = currentFrameIndex / metadata.fps;
    return subtitles.find((sub) => currentTime >= sub.start && currentTime <= sub.end);
  }, [isBlurMode, currentFrameIndex, subtitles, metadata]);

  const geometry = useMemo(() => {
    if (!metadata) return null;
    const textToMeasure = activeSubtitle ? activeSubtitle.text : "Preview Text Size";
    const green = calculateTextRect(
      textToMeasure,
      metadata.width,
      metadata.height,
      blurSettings
    );
    return { green: { x: green.x, y: green.y, w: green.w, h: green.h } };
  }, [blurSettings, metadata, activeSubtitle]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartY.current = e.clientY;
    dragStartYSetting.current = blurSettings.y;
  }, [blurSettings.y]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !metadata || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const scaleY = metadata.height / rect.height;
    const deltaY = (e.clientY - dragStartY.current) * scaleY;
    const newY = Math.round(dragStartYSetting.current + deltaY);
    setBlurSettings({ y: Math.max(0, Math.min(metadata.height, newY)) });
  }, [isDragging, metadata, setBlurSettings]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('mouseleave', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const toCss = (rect: { x: number; y: number; w: number; h: number }) => {
    if (!metadata) return {};
    return {
      left: `${(rect.x / metadata.width) * 100}%`,
      top: `${(rect.y / metadata.height) * 100}%`,
      width: `${(rect.w / metadata.width) * 100}%`,
      height: `${(rect.h / metadata.height) * 100}%`,
    };
  };

  if (!file && !metadata) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-txt-subtle">
        <ImageOff size={48} className="mb-4 opacity-20" />
        <p className="text-sm">Upload a video to start editing</p>
      </div>
    );
  }

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
                className="absolute top-4 right-4 z-50 p-2 bg-black/60 hover:bg-black/90 text-white/80 hover:text-white rounded-full transition-all border border-white/10 shadow-lg backdrop-blur-sm"
              >
                {showGuides ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            )}
            {!isBlurMode && (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={onCropComplete}
                className="w-full h-full block"
              >
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt="Frame"
                  className="w-full h-full object-contain select-none block"
                  onDragStart={(e) => e.preventDefault()}
                />
              </ReactCrop>
            )}
            {isBlurMode && (
              <div className="relative w-full h-full">
                <img
                  src={blurPreviewUrl || imgSrc}
                  alt="Frame"
                  className="w-full h-full object-contain select-none block"
                  onDragStart={(e) => e.preventDefault()}
                />
                {showGuides && geometry && (
                  <>
                    <div
                      className="absolute bg-green-500/10 border border-green-500/90 z-40 cursor-grab active:cursor-grabbing group/green"
                      style={toCss(geometry.green)}
                      onMouseDown={handleMouseDown}
                      title="Drag to Move Vertical Position"
                    >
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/green:opacity-100 transition-opacity">
                        <MoveVertical size={16} className="text-green-400 drop-shadow-md" />
                      </div>
                    </div>
                    {isDragging && (
                      <div className="absolute top-4 left-4 bg-black/80 text-white text-xs px-2 py-1 rounded border border-white/20 z-50 font-mono">
                        Y: {blurSettings.y}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};