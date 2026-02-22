/**
 * Hook to manage the debounced fetching and cleanup of blur preview frame URLs.
 */
import { useState, useEffect, useRef } from 'react';
import { api } from '../../../services/api';
import type { VideoMetadata, BlurSettings, SubtitleItem } from '../../../types';

export const useBlurPreview = (
  metadata: VideoMetadata | null,
  blurSettings: BlurSettings,
  subtitles: SubtitleItem[],
  currentFrameIndex: number,
  setBlurPreviewUrl: (url: string | null) => void
) => {
  const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!metadata) return;

    let isActive = true;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    setIsPreviewUpdating(true);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const time = currentFrameIndex / metadata.fps;
        const sub = subtitles.find(s => time >= s.start && time <= s.end);
        const text = sub ? sub.text : "Preview Mode";

        const url = await api.getBlurPreview({
          filename: metadata.filename,
          frame_index: currentFrameIndex,
          blur_settings: blurSettings,
          subtitle_text: text
        });

        if (isActive) {
          if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
          }
          currentUrlRef.current = url;
          setBlurPreviewUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isActive) setIsPreviewUpdating(false);
      }
    }, 500);

    return () => {
      isActive = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [blurSettings, currentFrameIndex, metadata, subtitles, setBlurPreviewUrl]);

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        setBlurPreviewUrl(null);
      }
    };
  }, [setBlurPreviewUrl]);

  return { isPreviewUpdating };
};
