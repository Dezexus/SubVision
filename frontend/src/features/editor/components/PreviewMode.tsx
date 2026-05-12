/**
 * Renders the preview mode interface, integrating the video player, active subtitle editor, and timeline.
 */
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { Timeline } from '../../timeline';
import { ActiveSubtitleEditor } from '../../subtitles';
import { API_BASE } from '../../../shared/api';
import type { SubtitleItem } from '../../../types';

const THROTTLE_INTERVAL = 100;

export const PreviewMode = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const file = useVideoStore((s) => s.file);
  const setCurrentFrame = useVideoStore((s) => s.setCurrentFrame);
  const previewVolume = useVideoStore((s) => s.previewVolume);
  const setPreviewVolume = useVideoStore((s) => s.setPreviewVolume);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const updateSubtitle = useProcessingStore((s) => s.updateSubtitle);
  const deleteSubtitle = useProcessingStore((s) => s.deleteSubtitle);
  const saveHistory = useProcessingStore((s) => s.saveHistory);

  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number>();
  const lastThrottleTimeRef = useRef<number>(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubtitleItem | null | undefined>(null);
  const [localText, setLocalText] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const prevActiveSubIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (activeSub && activeSub.id !== prevActiveSubIdRef.current) {
      setLocalText(activeSub.text);
      prevActiveSubIdRef.current = activeSub.id;
    } else if (!activeSub) {
      prevActiveSubIdRef.current = null;
    }
  }, [activeSub]);

  const updateActiveSubtitle = useCallback(
    (time: number) => {
      if (subtitles.length === 0) {
        setActiveSub(null);
        return;
      }
      for (let i = 0; i < subtitles.length; i++) {
        if (time >= subtitles[i].start && time <= subtitles[i].end) {
          setActiveSub(subtitles[i]);
          return;
         }
      }
      setActiveSub(null);
    },
    [subtitles]
  );

  const syncCurrentFrame = useCallback(
    (time: number) => {
      if (metadata) {
        const frame = Math.round(time * metadata.fps);
        setCurrentFrame(frame);
      }
    },
    [metadata, setCurrentFrame]
  );

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      if (video.paused) video.play();
      else video.pause();
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePlayPause]);

  useEffect(() => {
    if (isPlaying) {
      const loop = () => {
        const video = videoRef.current;
        if (video) {
          const now = performance.now();
          if (now - lastThrottleTimeRef.current >= THROTTLE_INTERVAL) {
            lastThrottleTimeRef.current = now;
            const time = video.currentTime;
            setCurrentTime(time);
            updateActiveSubtitle(time);
            syncCurrentFrame(time);
          }
        }
        animationFrameRef.current = requestAnimationFrame(loop);
      };
      animationFrameRef.current = requestAnimationFrame(loop);
    }
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
     };
  }, [isPlaying, updateActiveSubtitle, syncCurrentFrame]);

  useEffect(() => {
    if (metadata) {
      if (file) {
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        return () => URL.revokeObjectURL(url);
      } else {
        const url = `${API_BASE}/api/video/download/${metadata.filename}`;
        setVideoUrl(url);
        return () => setVideoUrl(null);
      }
     }
  }, [file, metadata]);

  const handleStepFrame = useCallback(
    (frames: number) => {
      const video = videoRef.current;
      if (video && metadata && metadata.fps > 0) {
        if (!video.paused) video.pause();
        const currentFrame = Math.round(video.currentTime * metadata.fps);
        let newTime = (currentFrame + frames) / metadata.fps;
        newTime = Math.max(0, Math.min(video.duration || 0, newTime));
         video.currentTime = newTime + 0.0001;
        setCurrentTime(newTime);
        syncCurrentFrame(newTime);
      }
    },
    [metadata, syncCurrentFrame]
  );

  const handleSeek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (video) {
        video.currentTime = time;
        setCurrentTime(time);
        updateActiveSubtitle(time);
        syncCurrentFrame(time);
      }
    },
    [updateActiveSubtitle, syncCurrentFrame]
  );

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = previewVolume;
  }, [previewVolume]);

  const handleLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const dur = e.currentTarget.duration;
    setDuration(dur);
  }, []);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      setLocalText(newText);
      if (activeSub) {
        updateSubtitle({ ...activeSub, text: newText });
      }
    },
    [activeSub, updateSubtitle]
  );

  if (!metadata) return null;

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <div className="relative w-full flex-1 bg-black flex items-center justify-center rounded-xl border border-border-main overflow-hidden shadow-2xl">
        {videoUrl && (
          <video
            ref={videoRef}
            src={videoUrl}
            autoPlay
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onLoadedMetadata={handleLoadedMetadata}
            onDurationChange={handleLoadedMetadata}
            className="w-full h-full object-contain"
          />
        )}
      </div>
      <ActiveSubtitleEditor
        activeSub={activeSub}
        text={localText}
        onChange={handleTextChange}
        onFocus={() => {
          saveHistory();
          setIsFocused(true);
        }}
        onBlur={() => setIsFocused(false)}
        onDelete={() => {
          if (activeSub) deleteSubtitle(activeSub.id);
        }}
      />
      <div className="shrink-0">
         <Timeline
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onStepFrame={handleStepFrame}
          onSeek={handleSeek}
          volume={previewVolume}
          onVolumeChange={setPreviewVolume}
          currentTimeOverride={currentTime}
          durationOverride={duration}
          activeEditId={isFocused && activeSub ? activeSub.id : null}
        />
      </div>
    </div>
  );
};