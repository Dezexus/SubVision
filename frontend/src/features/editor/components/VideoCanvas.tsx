import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';
import { Loader2, ImageOff, Eye, EyeOff } from 'lucide-react';

export const VideoCanvas = () => {
  const {
    metadata,
    currentFrameIndex,
    setRoi,
    file,
    isBlurMode,
    blurSettings,
    subtitles,
    blurPreviewUrl
  } = useAppStore();

  const [crop, setCrop] = useState<Crop>();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // State to toggle visibility of guide boxes
  const [showGuides, setShowGuides] = useState(true);

  const imgRef = useRef<HTMLImageElement>(null);

  const aspectRatio = useMemo(() => {
    if (!metadata || metadata.height === 0) return 16 / 9;
    return metadata.width / metadata.height;
  }, [metadata]);

  useEffect(() => {
    if (!metadata) return;
    setIsLoading(true);
    const url = api.getFrameUrl(metadata.filename, currentFrameIndex);

    const img = new Image();
    img.src = url;
    img.onload = () => {
      setImgSrc(url);
      setIsLoading(false);
    };
    img.onerror = () => setIsLoading(false);
  }, [currentFrameIndex, metadata]);

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

  // --- Visual Boxes Calculation ---
  const { greenBoxStyle, redBoxStyle } = useMemo(() => {
      if (!metadata) return { greenBoxStyle: { display: 'none' }, redBoxStyle: { display: 'none' } };

      const textToMeasure = activeSubtitle ? activeSubtitle.text : "Preview Text Size";

      const fontSizePx = blurSettings.font_size;
      const charAspectRatio = 0.52;

      const textWidth = Math.floor(textToMeasure.length * fontSizePx * charAspectRatio);

      // Add 4px buffer to match Backend logic
      const textHeight = fontSizePx + 4;

      const paddingYPx = Math.floor(textHeight * blurSettings.padding_y);

      // Position logic
      const x = Math.floor((metadata.width - textWidth) / 2);
      const y = blurSettings.y - textHeight; // Bottom anchored

      // 1. Green Box (Text Target)
      const greenX = x;
      const greenY = y;
      const greenW = textWidth;
      const greenH = textHeight;

      // 2. Red Box (Blur Coverage)
      const redX = Math.max(0, x - blurSettings.padding_x);
      const redY = Math.max(0, y - paddingYPx);

      const rawRedW = textWidth + (blurSettings.padding_x * 2);
      const rawRedH = textHeight + (paddingYPx * 2);

      const redW = Math.min(metadata.width - redX, rawRedW);
      const redH = Math.min(metadata.height - redY, rawRedH);

      const green: React.CSSProperties = {
          position: 'absolute',
          left: `${(greenX / metadata.width) * 100}%`,
          top: `${(greenY / metadata.height) * 100}%`,
          width: `${(greenW / metadata.width) * 100}%`,
          height: `${(greenH / metadata.height) * 100}%`,
          zIndex: 35,
          pointerEvents: 'none',
          border: '1px solid rgba(0, 255, 0, 0.9)',
          backgroundColor: 'rgba(0, 255, 0, 0.15)',
          boxSizing: 'border-box',
      };

      const red: React.CSSProperties = {
          position: 'absolute',
          left: `${(redX / metadata.width) * 100}%`,
          top: `${(redY / metadata.height) * 100}%`,
          width: `${(redW / metadata.width) * 100}%`,
          height: `${(redH / metadata.height) * 100}%`,
          zIndex: 34,
          pointerEvents: 'none',
          border: '1px dashed rgba(255, 50, 50, 0.8)',
          boxSizing: 'border-box',
      };

      return { greenBoxStyle: green, redBoxStyle: red };
  }, [blurSettings, metadata, activeSubtitle]);

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
        className="relative shadow-2xl shadow-black/50 border border-[#333333] rounded-xl overflow-hidden bg-black group/canvas"
        style={{ aspectRatio, maxHeight: '100%', maxWidth: '100%' }}
      >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20 backdrop-blur-[2px]">
                <Loader2 className="animate-spin text-[#007acc]" size={32} />
            </div>
          )}

          {imgSrc && (
              <>
                {/* Toggle Guide Button (Visible only in Blur Mode) */}
                {isBlurMode && (
                    <button
                        onClick={() => setShowGuides(!showGuides)}
                        className="absolute top-4 right-4 z-50 p-2 bg-black/60 hover:bg-black/90 text-white/80 hover:text-white rounded-full transition-all border border-white/10 shadow-lg backdrop-blur-sm"
                        title={showGuides ? "Hide Guides" : "Show Guides"}
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
                            alt={`Frame ${currentFrameIndex}`}
                            className="w-full h-full object-contain select-none block"
                            onDragStart={(e) => e.preventDefault()}
                        />
                    </ReactCrop>
                )}

                {isBlurMode && (
                    <div className="relative w-full h-full">
                        {/* 1. Base Image (Preview from API or Raw) */}
                        <img
                            src={blurPreviewUrl || imgSrc}
                            alt={`Frame ${currentFrameIndex}`}
                            className="w-full h-full object-contain select-none block"
                        />

                        {/* 2. Visual Guides (Conditionally Rendered) */}
                        {showGuides && (
                            <>
                                <div style={greenBoxStyle} title="Target Text Area"></div>
                                <div style={redBoxStyle} title="Blur Coverage"></div>

                                {!activeSubtitle && (
                                <div style={{...greenBoxStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', border: 'none', background: 'none'}}>
                                        <span className="text-[10px] text-white/70 bg-black/60 px-1 rounded whitespace-nowrap">
                                            Placement Preview
                                        </span>
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
