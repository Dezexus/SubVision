import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';
import { Loader2, ImageOff } from 'lucide-react';

export const VideoCanvas = () => {
  const { metadata, currentFrameIndex, setRoi, file } = useAppStore();

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
    img.onerror = () => {
      setIsLoading(false);
    };

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

  if (!file || !metadata) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-[#555]">
        <ImageOff size={48} className="mb-4 opacity-20" />
        <p className="text-sm">Upload a video to start editing</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center">
      <div 
        className="relative shadow-2xl shadow-black/50 border border-[#333333] rounded-xl overflow-hidden bg-black"
        style={{
          aspectRatio: aspectRatio,
          maxHeight: '100%',
          maxWidth: '100%'
        }}
      >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 z-20 backdrop-blur-[2px]">
                <Loader2 className="animate-spin text-[#007acc]" size={32} />
            </div>
          )}

          {imgSrc && (
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
      </div>
    </div>
  );
};
