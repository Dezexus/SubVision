/**
 * Custom hook to fetch and manage video frame blob URLs.
 */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api } from '../../../services/api';
import type { VideoMetadata } from '../../../types';

export const useVideoFrame = (metadata: VideoMetadata | null, currentFrameIndex: number) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!metadata) {
      setImgSrc(null);
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

  return { imgSrc, isLoading };
};
