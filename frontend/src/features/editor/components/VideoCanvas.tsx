import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';
import { Loader2, ImageOff } from 'lucide-react';

export const VideoCanvas = () => {
  const {
    metadata,
    currentFrameIndex,
    setRoi,
    file,
    isBlurMode,
    blurSettings,
    subtitles
  } = useAppStore();

  const [crop, setCrop] = useState<Crop>();
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  // --- Dynamic Style Calculation ---
  const { containerStyle, innerBoxStyle } = useMemo(() => {
      if (!metadata) return { containerStyle: { display: 'none' }, innerBoxStyle: {} };

      const textToMeasure = activeSubtitle ? activeSubtitle.text : "Preview Text Size";

      const estimatedFontSize = 22 * blurSettings.font_scale;
      const estimatedCharWidth = estimatedFontSize * 0.55;

      const textWidth = textToMeasure.length * estimatedCharWidth;
      const textHeight = estimatedFontSize;

      // NEW: Calculate Y padding in pixels based on the multiplier
      const paddingYPx = textHeight * blurSettings.padding_y;

      const x = (metadata.width - textWidth) / 2;
      const y = blurSettings.y - textHeight;

      const finalX = x - blurSettings.padding_x;
      const finalY = y - paddingYPx; // Use calculated pixels
      const finalW = textWidth + (blurSettings.padding_x * 2);
      const finalH = textHeight + (paddingYPx * 2); // Use calculated pixels

      const feather = blurSettings.feather || 0;
      const safeFeatherX = Math.min(feather, finalW * 0.35);
      const safeFeatherY = Math.min(feather, finalH * 0.35);

      const container: React.CSSProperties = {
          position: 'absolute',
          left: `${(finalX / metadata.width) * 100}%`,
          top: `${(finalY / metadata.height) * 100}%`,
          width: `${(finalW / metadata.width) * 100}%`,
          height: `${(finalH / metadata.height) * 100}%`,
          zIndex: 30,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: activeSubtitle ? '1px dashed rgba(255, 100, 100, 0.7)' : '1px dashed rgba(255, 255, 255, 0.3)',
          boxSizing: 'border-box',
      };

      const blurRadius = Math.max(1, blurSettings.sigma * 0.6);

      if (feather > 0) {
          const mask = `
            linear-gradient(to right, transparent, black ${safeFeatherX}px, black calc(100% - ${safeFeatherX}px), transparent),
            linear-gradient(to bottom, transparent, black ${safeFeatherY}px, black calc(100% - ${safeFeatherY}px), transparent)
          `;

          container.backdropFilter = `blur(${blurRadius}px)`;
          container.WebkitBackdropFilter = `blur(${blurRadius}px)`;

          // @ts-ignore
          container.maskImage = mask;
          // @ts-ignore
          container.WebkitMaskImage = mask;
          // @ts-ignore
          container.maskComposite = 'intersect';
          // @ts-ignore
          container.WebkitMaskComposite = 'source-in';
      } else {
          container.backdropFilter = `blur(${blurRadius}px)`;
          container.WebkitBackdropFilter = `blur(${blurRadius}px)`;
      }

      const inner: React.CSSProperties = {
          width: `calc(100% - ${safeFeatherX * 2}px)`,
          height: `calc(100% - ${safeFeatherY * 2}px)`,
          border: '1px solid rgba(100, 255, 100, 0.8)',
          borderRadius: '2px',
          boxSizing: 'border-box',
      };

      return { containerStyle: container, innerBoxStyle: inner };
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
        className="relative shadow-2xl shadow-black/50 border border-[#333333] rounded-xl overflow-hidden bg-black"
        style={{ aspectRatio, maxHeight: '100%', maxWidth: '100%' }}
      >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20 backdrop-blur-[2px]">
                <Loader2 className="animate-spin text-[#007acc]" size={32} />
            </div>
          )}

          {imgSrc && (
              <>
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
                        <img
                            src={imgSrc}
                            alt={`Frame ${currentFrameIndex}`}
                            className="w-full h-full object-contain select-none block"
                        />

                        <div style={containerStyle}></div>

                        <div style={{
                             ...containerStyle,
                             backdropFilter: 'none',
                             WebkitBackdropFilter: 'none',
                             maskImage: 'none',
                             WebkitMaskImage: 'none',
                             background: 'transparent',
                             border: activeSubtitle ? '1px dashed rgba(255, 50, 50, 0.8)' : '1px dashed rgba(255, 255, 255, 0.3)'
                        }}>
                             {(blurSettings.feather || 0) > 0 && (
                                <div style={innerBoxStyle} />
                             )}

                             {!activeSubtitle && (
                                <span className="absolute -top-6 text-[10px] text-white/70 bg-black/60 px-1 rounded whitespace-nowrap">
                                    Placement Preview
                                </span>
                             )}
                        </div>
                    </div>
                )}
              </>
          )}
      </div>
    </div>
  );
};
