import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api } from '../../../services/api';
import type { VideoMetadata } from '../../../types';
import { useUIStore } from '../../../store/uiStore';

const MAX_FRAME_CACHE = 50;
const frameCache = new Map<string, string>();

export const clearFrameCache = () => {
  frameCache.forEach(url => URL.revokeObjectURL(url));
  frameCache.clear();
};

export const useVideoFrame = (metadata: VideoMetadata | null, currentFrameIndex: number) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const videoExpiredRef = useRef(false);
  const addToast = useUIStore((s) => s.addToast);

  useEffect(() => {
    clearFrameCache();
    videoExpiredRef.current = false;
  }, [metadata?.filename]);

  useEffect(() => {
    if (!metadata) {
      setImgSrc(null);
      setError(null);
      return;
    }

    const cacheKey = `${metadata.filename}_${currentFrameIndex}`;

    if (frameCache.has(cacheKey)) {
      const url = frameCache.get(cacheKey)!;
      frameCache.delete(cacheKey);
      frameCache.set(cacheKey, url);
      setImgSrc(url);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    let isActive = true;
    setError(null);

    debounceTimerRef.current = setTimeout(async () => {
      if (!isActive || videoExpiredRef.current) {
        if (videoExpiredRef.current) {
          setError("Video unavailable");
          setIsLoading(false);
        }
        return;
      }

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
          setError(null);
        } else if (url) {
          URL.revokeObjectURL(url);
        }
      } catch (err: unknown) {
        if (!isActive) return;
        if (axios.isCancel(err)) return;

        const typedErr = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
        if (typedErr.response && typedErr.response.status === 404) {
          videoExpiredRef.current = true;
          addToast("Video file has expired or been deleted. Please re-upload.", "error");
          setError("Video unavailable");
        } else {
          const msg = typedErr.response?.data?.detail || typedErr.message || 'Failed to load frame';
          setError(msg);
          console.error('Frame fetch error:', err);
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
  }, [currentFrameIndex, metadata, addToast]);

  return { imgSrc, isLoading, error };
};