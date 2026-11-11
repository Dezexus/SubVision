/**
 * Renders the preview mode interface, integrating the video player, active subtitle editor, and timeline.
 */
import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Pause } from 'lucide-react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { Timeline } from '../../timeline';
import { ActiveSubtitleEditor } from '../../subtitles';
import { API_BASE } from '../../../shared/api';
import { countTracks, subtitleAt, trackOf, useGlobalKeydown } from '../../../shared/lib';
import { useTranslation } from '../../../i18n';
import type { SubtitleItem } from '../../../types';

const THROTTLE_INTERVAL = 100;

export const PreviewMode = () => {
  const { t } = useTranslation();
  const metadata = useVideoStore((s) => s.metadata);
  const file = useVideoStore((s) => s.file);
  const setCurrentFrame = useVideoStore((s) => s.setCurrentFrame);
  const previewVolume = useVideoStore((s) => s.previewVolume);
  const setPreviewVolume = useVideoStore((s) => s.setPreviewVolume);
  const setActiveTrack = useVideoStore((s) => s.setActiveTrack);
  const regionCount = useVideoStore((s) => s.rois.length);

  const subtitles = useProcessingStore((s) => s.subtitles);
  const updateSubtitle = useProcessingStore((s) => s.updateSubtitle);
  const deleteSubtitle = useProcessingStore((s) => s.deleteSubtitle);
  const beginEdit = useProcessingStore((s) => s.beginEdit);
  const endEdit = useProcessingStore((s) => s.endEdit);

  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastThrottleTimeRef = useRef<number>(0);
  const prevTimeRef = useRef<number>(0);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [activeSub, setActiveSub] = useState<SubtitleItem | null | undefined>(null);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [isAutoPauseEnabled, setIsAutoPauseEnabled] = useState(true);

  const activeSubRef = useRef<SubtitleItem | null | undefined>(null);
  const autoPauseRef = useRef<boolean>(isAutoPauseEnabled);

  useEffect(() => {
    activeSubRef.current = activeSub;
  }, [activeSub]);

  useEffect(() => {
    autoPauseRef.current = isAutoPauseEnabled;
  }, [isAutoPauseEnabled]);

  // Auto-pause follows the cue of the current track.
  const updateActiveSubtitle = useCallback(
    (time: number) => {
      setActiveSub(subtitleAt(subtitles, time, useVideoStore.getState().activeTrack) ?? null);
    },
    [subtitles]
  );

  // Every cue on screen gets its own editor, in track order.
  const visibleCues = useMemo(
    () => subtitles
      .filter((s) => currentTime >= s.start && currentTime <= s.end)
      .sort((a, b) => trackOf(a) - trackOf(b)),
    [subtitles, currentTime],
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

  useGlobalKeydown((e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      handlePlayPause();
    }
  });

  useEffect(() => {
    if (isPlaying) {
      const loop = () => {
        const video = videoRef.current;
        if (video) {
          const now = performance.now();
          if (now - lastThrottleTimeRef.current >= THROTTLE_INTERVAL) {
            lastThrottleTimeRef.current = now;
            let time = video.currentTime;
            
            if (autoPauseRef.current && activeSubRef.current) {
              const midpoint = activeSubRef.current.start + (activeSubRef.current.end - activeSubRef.current.start) / 2;
              if (time >= midpoint && prevTimeRef.current < midpoint) {
                video.pause();
                setIsPlaying(false);
                time = midpoint;
                video.currentTime = time;
              }
            }
            
            prevTimeRef.current = time;
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
        // The object URL represents an external browser resource.
        // eslint-disable-next-line react-hooks/set-state-in-effect
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
        prevTimeRef.current = newTime;
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
        prevTimeRef.current = time;
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

  if (!metadata) return null;

  return (
    <div className="w-full h-full flex flex-col gap-4">
      <div className="relative w-full flex-1 bg-black flex items-center justify-center rounded-xl border border-border-main overflow-hidden shadow-2xl group/preview">
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
        <button
          onClick={() => setIsAutoPauseEnabled(!isAutoPauseEnabled)}
          className={`absolute top-4 left-4 z-50 px-3 py-1.5 rounded-md bg-black/60 backdrop-blur-sm border transition-colors flex items-center gap-2 text-xs font-bold uppercase opacity-0 group-hover/preview:opacity-100 ${
            isAutoPauseEnabled
              ? 'border-brand-500/50 text-brand-400'
              : 'border-white/10 text-white/50 hover:text-white'
          }`}
          title={t('editor.autoPauseTitle')}
        >
          {isAutoPauseEnabled ? <Pause size={14} /> : <Play size={14} />}
          {t('editor.autoPause')}
        </button>
      </div>
      <ActiveSubtitleEditor
        cues={visibleCues}
        showTrack={countTracks(regionCount, subtitles) > 1}
        onChange={(id, text) => updateSubtitle(id, { text })}
        onFocus={(cue) => {
          beginEdit();
          setFocusedId(cue.id);
          setActiveTrack(trackOf(cue));
        }}
        onBlur={() => {
          endEdit();
          setFocusedId(null);
        }}
        onDelete={deleteSubtitle}
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
          activeEditId={focusedId}
        />
      </div>
    </div>
  );
};