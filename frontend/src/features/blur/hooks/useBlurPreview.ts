import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { api } from '../../../shared/api';
import { calculateTextRect } from '../../../shared/lib/textGeometry';
import type { VideoMetadata, BlurSettings, SubtitleItem } from '../../../types';

const MAX_BLUR_CACHE = 30;
const blurCache = new Map<string, string>();

const generateLocalPreview = async (
  filename: string,
  frameIndex: number,
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
        const rect = calculateTextRect(text, img.width, img.height, settings);
        if (rect.w > 0 && rect.h > 0) {
          ctx.save();
          ctx.filter = `blur(${settings.sigma}px)`;
          ctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
          ctx.restore();
        }
      }

      URL.revokeObjectURL(frameUrl);
      canvas.toBlob(
        (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject('Canvas encode failed')),
        'image/jpeg',
        0.85,
      );
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

  // Depend on the active texts only (as a string key), so editing an unrelated
  // subtitle does not restart the preview request.
  const time = metadata ? currentFrameIndex / metadata.fps : 0;
  const textsKey = useMemo(
    () => JSON.stringify(
      subtitles
        .filter((s) => time >= s.start && time <= s.end && s.text?.trim())
        .map((s) => s.text.trim()),
    ),
    [subtitles, time],
  );

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

    const texts: string[] = JSON.parse(textsKey);
    const text = texts[0] ?? "";

    const settingsKey = JSON.stringify(blurSettings);
    const cacheKey = `${metadata.filename}_${currentFrameIndex}_${texts.join("|")}_${settingsKey}`;

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
          url = await generateLocalPreview(metadata.filename, currentFrameIndex, blurSettings, text, abortController.signal);
        } else {
          url = await api.getBlurPreview({
            filename: metadata.filename,
            frame_index: currentFrameIndex,
            blur_settings: blurSettings,
            subtitle_text: text,
            subtitle_texts: texts,
          }, abortController.signal);
        }

        if (isActive) {
          if (blurCache.size >= MAX_BLUR_CACHE) {
            const firstKey = blurCache.keys().next().value;
            if (firstKey) {
              const oldUrl = blurCache.get(firstKey);
              if (oldUrl) URL.revokeObjectURL(oldUrl);
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
  }, [blurSettings, currentFrameIndex, metadata, textsKey, setBlurPreviewUrl]);

  return { isPreviewUpdating };
};
