import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api } from '../../../services/api';
import type { VideoMetadata } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';

const MAX_FRAME_CACHE = 50;
const frameCache = new Map<string, string>();

export const useVideoFrame = (metadata: VideoMetadata | null, currentFrameIndex: number) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    frameCache.forEach(url => URL.revokeObjectURL(url));
    frameCache.clear();
  }, [metadata?.filename]);

  useEffect(() => {
    if (!metadata) {
      setImgSrc(null);
      return;
    }

    const cacheKey = `${metadata.filename}_${currentFrameIndex}`;

    if (frameCache.has(cacheKey)) {
      const url = frameCache.get(cacheKey)!;
      frameCache.delete(cacheKey);
      frameCache.set(cacheKey, url);
      setImgSrc(url);
      setIsLoading(false);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    let isActive = true;

    debounceTimerRef.current = setTimeout(async () => {
      if (!isActive) return;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsLoading(true);

      try {
        const url = await api.getFrameBlob(metadata.filename, currentFrameIndex, abortController.signal);

        if (isActive && url) {
          if (frameCache.size >= MAX_FRAME_CACHE) {
            const firstKey = frameCache.keys().next().value;
            if (firstKey) {
              const oldUrl = frameCache.get(firstKey);
              if (oldUrl) URL.revokeObjectURL(oldUrl);
              frameCache.delete(firstKey);
            }
          }
          frameCache.set(cacheKey, url);
          setImgSrc(url);
        } else if (url) {
          URL.revokeObjectURL(url);
        }
      } catch (err: unknown) {
        if (!axios.isCancel(err) && isActive) {
          console.error('Failed to fetch frame:', err);
          const typedErr = err as { response?: { status?: number } };
          if (typedErr.response && typedErr.response.status === 404) {
            const state = useAppStore.getState();
            state.resetProject();
            state.addToast("Session expired. The video file was cleaned up by the server.", "error");
          }
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    }, 80);

    return () => {
      isActive = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [currentFrameIndex, metadata]);

  return { imgSrc, isLoading };
};