import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api } from '../../../shared/api';
import type { VideoMetadata, BlurSettings, SubtitleItem } from '../../../types';

const MAX_BLUR_CACHE = 30;
const blurCache = new Map<string, string>();

const estimateTextWidth = (text: string, fontSizePx: number, multiplier: number): number => {
  let width = 0.0;
  for (const char of text) {
    if (/[\u4e00-\u9fa5\u3040-\u30ff\uac00-\ud7af\uff00-\uffef]/.test(char)) width += 1.1;
    else if (/[mwWM@OQG]/.test(char)) width += 0.95;
    else if (/[A-Z]/.test(char)) width += 0.8;
    else if (/[0-9]/.test(char)) width += 0.65;
    else if (/[il1.,!I|:;tfj]/.test(char)) width += 0.35;
    else width += 0.65;
  }
  return Math.ceil(width * fontSizePx * multiplier);
};

const generateLocalPreview = async (
  filename: string,
  frameIndex: number,
  metadata: VideoMetadata,
  settings: BlurSettings,
  text: string,
  signal: AbortSignal
): Promise<string> => {
  const frameUrl = await api.getFrameBlob(filename, frameIndex, signal);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No 2d context');
      
      ctx.drawImage(img, 0, 0);
      
      if (text && settings.sigma > 0) {
        const fontSizePx = settings.font_size;
        const widthMult = settings.width_multiplier || 1.0;
        const heightMult = settings.height_multiplier || 1.0;
        const numLines = text.split('\n').length;

        const textW = estimateTextWidth(text, fontSizePx, widthMult);
        const textH = (fontSizePx + 4) * numLines * heightMult;

        const x = Math.max(0, (img.width - textW) / 2);
        const y = Math.max(0, settings.y - textH);
        const bw = Math.min(img.width - x, textW);
        const bh = Math.min(img.height - y, textH);

        ctx.save();
        ctx.filter = `blur(${settings.sigma}px)`;
        ctx.drawImage(canvas, x, y, bw, bh, x, y, bw, bh);
        ctx.restore();
      }
      
      URL.revokeObjectURL(frameUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(frameUrl);
      reject('Image load failed');
    };
    img.src = frameUrl;
  });
};

export const useBlurPreview = (
  metadata: VideoMetadata | null,
  blurSettings: BlurSettings,
  subtitles: SubtitleItem[],
  currentFrameIndex: number,
  setBlurPreviewUrl: (url: string | null) => void
) => {
  const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    blurCache.forEach(url => URL.revokeObjectURL(url));
    blurCache.clear();
  }, [metadata?.filename]);

  useEffect(() => {
    if (!metadata) return;

    let isActive = true;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const time = currentFrameIndex / metadata.fps;
    const sub = subtitles.find(s => time >= s.start && time <= s.end);
    const text = sub ? sub.text : "Preview Mode";

    const settingsKey = JSON.stringify(blurSettings);
    const cacheKey = `${metadata.filename}_${currentFrameIndex}_${text}_${settingsKey}`;

    if (blurCache.has(cacheKey)) {
      const url = blurCache.get(cacheKey)!;
      blurCache.delete(cacheKey);
      blurCache.set(cacheKey, url);
      setBlurPreviewUrl(url);
      setIsPreviewUpdating(false);
      return;
    }

    setIsPreviewUpdating(true);

    debounceTimerRef.current = setTimeout(async () => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        let url: string;
        if (blurSettings.mode === 'blur') {
          url = await generateLocalPreview(metadata.filename, currentFrameIndex, metadata, blurSettings, text, abortController.signal);
        } else {
          url = await api.getBlurPreview({
            filename: metadata.filename,
            frame_index: currentFrameIndex,
            blur_settings: blurSettings,
            subtitle_text: text
          }, abortController.signal);
        }

        if (isActive) {
          if (blurCache.size >= MAX_BLUR_CACHE) {
            const firstKey = blurCache.keys().next().value;
            if (firstKey) {
              const oldUrl = blurCache.get(firstKey);
              if (oldUrl) {
                URL.revokeObjectURL(oldUrl);
              }
              blurCache.delete(firstKey);
            }
          }
          blurCache.set(cacheKey, url);
          setBlurPreviewUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        if (axios.isCancel(e)) {
          return;
        }
        console.error(e);
      } finally {
        if (isActive) {
          setIsPreviewUpdating(false);
        }
      }
    }, 500);

    return () => {
      isActive = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [blurSettings, currentFrameIndex, metadata, subtitles, setBlurPreviewUrl]);

  return { isPreviewUpdating };
};