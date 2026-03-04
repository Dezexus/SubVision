import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { api } from '../../../services/api';
import type { VideoMetadata } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';

const MAX_FRAME_CACHE = 50;
const frameCache = new Map<string, string>();

let extractionVideo: HTMLVideoElement | null = null;

export const useVideoFrame = (metadata: VideoMetadata | null, currentFrameIndex: number) => {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const file = useAppStore(state => state.file);

  useEffect(() => {
    frameCache.forEach(url => URL.revokeObjectURL(url));
    frameCache.clear();
    if (extractionVideo) {
      extractionVideo.removeAttribute('src');
      extractionVideo.load();
      extractionVideo = null;
    }
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

    debounceTimerRef.current = setTimeout(() => {
      if (!isActive) return;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setIsLoading(true);

      const fetchFrame = async () => {
        try {
          let url = "";

          if (file) {
            if (!extractionVideo) {
              extractionVideo = document.createElement('video');
              extractionVideo.muted = true;
              extractionVideo.playsInline = true;
              extractionVideo.crossOrigin = "anonymous";
              extractionVideo.src = URL.createObjectURL(file);
              await new Promise((resolve) => {
                  if (extractionVideo) {
                      extractionVideo.onloadedmetadata = resolve;
                  }
              });
            }

            const targetTime = currentFrameIndex / metadata.fps;
            extractionVideo.currentTime = targetTime;

            try {
                await new Promise((resolve, reject) => {
                  if (!extractionVideo) return reject(new Error("No video element"));
                  const onSeeked = () => {
                    extractionVideo!.removeEventListener('seeked', onSeeked);
                    extractionVideo!.removeEventListener('error', onError);
                    resolve(true);
                  };
                  const onError = (errorEvent: Event) => {
                    extractionVideo!.removeEventListener('seeked', onSeeked);
                    extractionVideo!.removeEventListener('error', onError);
                    reject(errorEvent);
                  };
                  extractionVideo.addEventListener('seeked', onSeeked);
                  extractionVideo.addEventListener('error', onError);
                });

                if (isActive) {
                    const canvas = document.createElement('canvas');
                    canvas.width = metadata.width;
                    canvas.height = metadata.height;
                    const ctx = canvas.getContext('2d');

                    if (ctx && extractionVideo) {
                      ctx.drawImage(extractionVideo, 0, 0, canvas.width, canvas.height);
                      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.8));
                      if (blob) {
                        url = URL.createObjectURL(blob);
                      }
                    }
                }
            } catch {
                if (isActive) {
                    setIsLoading(false);
                }
                return;
            }
          }

          if (!url && isActive) {
            url = await api.getFrameBlob(metadata.filename, currentFrameIndex, abortController.signal);
          }

          if (isActive && url) {
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
          } else if (url) {
            URL.revokeObjectURL(url);
          }
        } catch (err: unknown) {
          if (!axios.isCancel(err) && isActive) {
            console.error(err);
            const typedErr = err as { response?: { status?: number } };
            if (typedErr.response && typedErr.response.status === 404) {
              const state = useAppStore.getState();
              state.resetProject();
              state.addToast("Session expired. The video file was cleaned up by the server.", "error");
            }
          }
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      };

      fetchFrame();

    }, 80);

    return () => {
      isActive = false;
      if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
          abortControllerRef.current.abort();
      }
    };
  }, [currentFrameIndex, metadata, file]);

  return { imgSrc, isLoading };
};
