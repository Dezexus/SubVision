/**
 * Video canvas component with AbortController for optimized frame fetching.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import axios from 'axios';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';
import { Loader2, ImageOff, Eye, EyeOff, MoveVertical } from 'lucide-react';

export const VideoCanvas = () => {
  const {
    metadata,
    currentFrameIndex,
    setRoi,
    file,
    isBlurMode,
    blurSettings,
    setBlurSettings,
    subtitles,
    blurPreviewUrl
  } = useAppStore();

  const [crop, setCrop] = useState<Crop>();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showGuides, setShowGuides] = useState(true);

  const [isDragging, setIsDragging] = useState<'none' | 'move-y' | 'resize-x' | 'resize-y'>('none');
  const dragStartRef = useRef<{ y: number, x: number, initialY: number, initialPadX: number, initialPadY: number }>({ y: 0, x: 0, initialY: 0, initialPadX: 0, initialPadY: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const aspectRatio = useMemo(() => {
    if (!metadata || metadata.height === 0) return 16 / 9;
    return metadata.width / metadata.height;
  }, [metadata]);

  useEffect(() => {
    if (!metadata) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    let isActive = true;

    const fetchFrame = async () => {
      try {
        const url = await api.getFrameBlob(metadata.filename, currentFrameIndex, abortController.signal);

        if (isActive) {
          if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
          }
          currentUrlRef.current = url;
          setImgSrc(url);
          setIsLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        if (!axios.isCancel(error)) {
          console.error(error);
          if (isActive) setIsLoading(false);
        }
      }
    };

    fetchFrame();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [currentFrameIndex, metadata]);

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    setCrop(undefined);
    setImgSrc(null);
  }, [file]);

  const activeSubtitle = useMemo(() => {
    if (!isBlurMode || !metadata) return null;
    const currentTime = currentFrameIndex / metadata.fps;
    return subtitles.find(sub => currentTime >= sub.start && currentTime <= sub.end);
  }, [isBlurMode, currentFrameIndex, subtitles, metadata]);

  const geometry = useMemo(() => {
    if (!metadata) return null;

    const textToMeasure = activeSubtitle ? activeSubtitle.text : "Preview Text Size";
    const fontSizePx = blurSettings.font_size;
    const charAspectRatio = 0.52;
    const textWidth = Math.floor(textToMeasure.length * fontSizePx * charAspectRatio);
    const textHeight = fontSizePx + 4;
    const paddingYPx = Math.floor(textHeight * blurSettings.padding_y);

    const x = Math.floor((metadata.width - textWidth) / 2);
    const y = blurSettings.y - textHeight;

    const greenX = x;
    const greenY = y;
    const greenW = textWidth;
    const greenH = textHeight;

    const redX = Math.max(0, x - blurSettings.padding_x);
    const redY = Math.max(0, y - paddingYPx);
    const rawRedW = textWidth + (blurSettings.padding_x * 2);
    const rawRedH = textHeight + (paddingYPx * 2);
    const redW = Math.min(metadata.width - redX, rawRedW);
    const redH = Math.min(metadata.height - redY, rawRedH);

    return {
        green: { x: greenX, y: greenY, w: greenW, h: greenH },
        red: { x: redX, y: redY, w: redW, h: redH },
        textHeight,
        paddingYPx
    };
  }, [blurSettings, metadata, activeSubtitle]);

  const getScale = () => {
    if (!containerRef.current || !metadata) return { x: 1, y: 1 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
        x: metadata.width / rect.width,
        y: metadata.height / rect.height
    };
  };

  const handleMouseDown = (e: React.MouseEvent, type: 'move-y' | 'resize-x' | 'resize-y') => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(type);
      dragStartRef.current = {
          y: e.clientY,
          x: e.clientX,
          initialY: blurSettings.y,
          initialPadX: blurSettings.padding_x,
          initialPadY: blurSettings.padding_y
      };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
      if (isDragging === 'none' || !geometry) return;

      const scale = getScale();
      const deltaY = (e.clientY - dragStartRef.current.y) * scale.y;
      const deltaX = (e.clientX - dragStartRef.current.x) * scale.x;

      if (isDragging === 'move-y') {
          setBlurSettings({ y: Math.round(dragStartRef.current.initialY + deltaY) });
      }
      else if (isDragging === 'resize-x') {
          const newPadX = Math.max(0, Math.round(dragStartRef.current.initialPadX + (deltaX * 0.5)));
          setBlurSettings({ padding_x: newPadX });
      }
      else if (isDragging === 'resize-y') {
          const pixelsChanged = deltaY * 0.5;
          const newHeightPx = (geometry.textHeight * dragStartRef.current.initialPadY) + pixelsChanged;
          const newPadY = Math.max(0, newHeightPx / geometry.textHeight);
          setBlurSettings({ padding_y: parseFloat(newPadY.toFixed(2)) });
      }
  }, [isDragging, geometry, setBlurSettings]);

  const handleMouseUp = useCallback(() => {
      setIsDragging('none');
  }, []);

  useEffect(() => {
      if (isDragging !== 'none') {
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

  const toCss = (rect: {x: number, y: number, w: number, h: number}) => {
      if (!metadata) return {};
      return {
          left: `${(rect.x / metadata.width) * 100}%`,
          top: `${(rect.y / metadata.height) * 100}%`,
          width: `${(rect.w / metadata.width) * 100}%`,
          height: `${(rect.h / metadata.height) * 100}%`
      };
  };

  if (!file || !metadata) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#555]">
        <ImageOff size={48} className="mb-4 opacity-20" />
        <p className="text-sm">Upload a video to start editing</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-4">
      <div
        ref={containerRef}
        className="relative shadow-2xl shadow-black/50 border border-[#333333] rounded-xl overflow-hidden bg-black group/canvas select-none"
        style={{ aspectRatio, maxHeight: '100%', maxWidth: '100%' }}
      >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20 backdrop-blur-[2px]">
                <Loader2 className="animate-spin text-[#007acc]" size={32} />
            </div>
          )}

          {imgSrc && (
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
                                    className="absolute border border-dashed border-red-500/80 z-30"
                                    style={toCss(geometry.red)}
                                >
                                    <div
                                        className="absolute -right-1 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-red-500/20"
                                        onMouseDown={(e) => handleMouseDown(e, 'resize-x')}
                                        title="Drag to adjust Width (Padding X)"
                                    />
                                    <div
                                        className="absolute -top-1 left-0 right-0 h-3 cursor-ns-resize hover:bg-red-500/20"
                                        onMouseDown={(e) => handleMouseDown(e, 'resize-y')}
                                        title="Drag to adjust Height (Padding Y)"
                                    />
                                     <div
                                        className="absolute -bottom-1 left-0 right-0 h-3 cursor-ns-resize hover:bg-red-500/20"
                                        onMouseDown={(e) => handleMouseDown(e, 'resize-y')}
                                    />
                                </div>

                                <div
                                    className="absolute bg-green-500/10 border border-green-500/90 z-40 cursor-grab active:cursor-grabbing group/green"
                                    style={toCss(geometry.green)}
                                    onMouseDown={(e) => handleMouseDown(e, 'move-y')}
                                    title="Drag to Move Vertical Position"
                                >
                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/green:opacity-100 transition-opacity">
                                        <MoveVertical size={16} className="text-green-400 drop-shadow-md" />
                                    </div>
                                </div>

                                {isDragging !== 'none' && (
                                    <div className="absolute top-4 left-4 bg-black/80 text-white text-xs px-2 py-1 rounded border border-white/20 z-50 font-mono">
                                        {isDragging === 'move-y' && `Y: ${blurSettings.y}`}
                                        {isDragging === 'resize-x' && `Pad X: ${blurSettings.padding_x}`}
                                        {isDragging === 'resize-y' && `Pad Y: ${blurSettings.padding_y}`}
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
