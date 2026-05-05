import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api } from '../../../services/api';
import type { VideoMetadata, BlurSettings, SubtitleItem } from '../../../types';

const MAX_BLUR_CACHE = 30;
const blurCache = new Map<string, string>();

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
        const url = await api.getBlurPreview({
          filename: metadata.filename,
          frame_index: currentFrameIndex,
          blur_settings: blurSettings,
          subtitle_text: text
        }, abortController.signal);

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