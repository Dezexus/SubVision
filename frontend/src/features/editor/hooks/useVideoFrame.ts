/**
 * Custom hook to fetch and manage video frame blob URLs with an LRU caching system.
 */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api } from '../../../services/api';
import type { VideoMetadata } from '../../../types';

const MAX_FRAME_CACHE = 50;
const frameCache = new Map<string, string>();

export const useVideoFrame = (metadata: VideoMetadata | null, currentFrameIndex: number) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

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
          if (frameCache.size >= MAX_FRAME_CACHE) {
            const firstKey = frameCache.keys().next().value;
            if (firstKey) {
              const oldUrl = frameCache.get(firstKey);
              if (oldUrl) {
                URL.revokeObjectURL(oldUrl);
              }
              frameCache.delete(firstKey);
            }
          }
          frameCache.set(cacheKey, url);
          setImgSrc(url);
          setIsLoading(false);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        if (!axios.isCancel(error)) {
          console.error(error);
          if (isActive) {
             setIsLoading(false);
          }
        }
      }
    };

    fetchFrame();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [currentFrameIndex, metadata]);

  return { imgSrc, isLoading };
};
