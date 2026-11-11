import React, { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Video, RotateCcw, Wand2, ScanLine, Droplet, Loader2, Square } from 'lucide-react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { allTrackSettings, settingsForTrack, useBlurStore } from '../../../store/blurStore';
import { useTrackLabel } from '../../../hooks/useTrackLabel';
import { Slider, Button } from '../../../shared/ui';
import { cn, countTracks, trackColor } from '../../../shared/lib';
import { useBlurPreview } from '../hooks/useBlurPreview';
import { useStartBlurRender } from '../mutations/useStartBlurRender';
import { useStopBlurRender } from '../mutations/useStopBlurRender';
import { useDefaultBlurSettingsQuery } from '../queries/useDefaultBlurSettingsQuery';
import { useTranslation } from '../../../i18n';

/**
 * Control panel for configuring and starting the smart blur rendering process.
 */
export const BlurControlPanel = () => {
  const { t } = useTranslation();
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const rois = useVideoStore((s) => s.rois);
  const activeTrack = useVideoStore((s) => s.activeTrack);
  const label = useTrackLabel();

  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const activeBlurJobId = useProcessingStore((s) => s.activeBlurJobId);
  const renderedVideoUrl = useProcessingStore((s) => s.renderedVideoUrl);
  const updateProgress = useProcessingStore((s) => s.updateProgress);
  const subtitles = useProcessingStore((s) => s.subtitles);

  const trackState = useBlurStore(
    useShallow((s) => ({ trackSettings: s.trackSettings, defaultBlurSettings: s.defaultBlurSettings })),
  );
  const storeDefaults = useBlurStore((s) => s.defaultBlurSettings);
  const setTrackSettings = useBlurStore((s) => s.setTrackSettings);
  const setDefaultBlurSettings = useBlurStore((s) => s.setDefaultBlurSettings);
  const resetTrack = useBlurStore((s) => s.resetTrack);
  const setBlurPreviewUrl = useBlurStore((s) => s.setBlurPreviewUrl);

  const trackCount = countTracks(rois.length, subtitles);
  const track = Math.min(activeTrack, trackCount - 1);
  const blurSettings = settingsForTrack(trackState, track);
  const setBlurSettings = (updates: Parameters<typeof setTrackSettings>[1]) => setTrackSettings(track, updates);

  // Tracks whose Y the user moved; the others follow the bottom of their ROI.
  const userAdjustedY = useRef(new Set<number>());

  const { data: defaultBlurSettings } = useDefaultBlurSettingsQuery();
  const { isPreviewUpdating } = useBlurPreview(metadata, trackState, blurSettings, subtitles, currentFrameIndex, setBlurPreviewUrl);
  const { execute: startBlurRender } = useStartBlurRender();
  const { execute: stopBlurRender } = useStopBlurRender();

  const videoHeight = metadata?.height || 1080;

  // (Re)apply server defaults once they load or after a project reset cleared them.
  useEffect(() => {
    if (defaultBlurSettings && !storeDefaults) {
      setDefaultBlurSettings(defaultBlurSettings);
      userAdjustedY.current.clear();
    }
  }, [defaultBlurSettings, storeDefaults, setDefaultBlurSettings]);

  useEffect(() => {
    if (!metadata || !storeDefaults) return;
    rois.forEach((roi, i) => {
      if (userAdjustedY.current.has(i) || roi[1] <= 0) return;
      const y = Math.max(0, Math.min(videoHeight, roi[1] + roi[3]));
      if (settingsForTrack(useBlurStore.getState(), i).y !== y) setTrackSettings(i, { y });
    });
  }, [rois, metadata, videoHeight, storeDefaults, setTrackSettings]);

  const handleRender = () => {
    if (!metadata || !clientId) return;
    updateProgress(0, metadata.total_frames, t('blur.starting'));
    startBlurRender({
      filename: metadata.filename,
      original_filename: metadata.original_filename || metadata.filename,
      client_id: clientId,
      subtitles: subtitles,
      blur_settings: settingsForTrack(trackState, 0),
      track_blur_settings: allTrackSettings(trackState, trackCount),
    });
  };

  const handleReset = () => {
    resetTrack(track);
    userAdjustedY.current.delete(track);
    const roi = rois[track];
    if (roi && roi[1] > 0) {
      setTrackSettings(track, { y: Math.max(0, Math.min(videoHeight, roi[1] + roi[3])) });
    }
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userAdjustedY.current.add(track);
    const newY = videoHeight - Number(e.target.value);
    setBlurSettings({ y: Math.max(0, Math.min(videoHeight, newY)) });
  };

  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
        {trackCount > 1 && (
          <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-xs', trackColor(track).border, trackColor(track).soft)}>
            <span className={cn('w-2 h-2 rounded-full shrink-0', trackColor(track).bg)} />
            <span className="text-txt-subtle">{t('tracks.settingsFor')}</span>
            <span className="font-semibold text-txt-main truncate">{label(track)}</span>
          </div>
        )}
        <div className="w-full bg-bg-panel p-2 rounded-xl border border-border-main shadow-sm flex items-center relative overflow-hidden">
          <div className="flex-1 flex items-center">
            {isPreviewUpdating ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] text-brand-500 font-mono bg-brand-500/10 px-2.5 py-1 rounded shadow-inner">
                <Loader2 size={12} className="animate-spin" />
                {t('blur.updating')}
              </span>
            ) : (
                <div className="w-32" />
            )}
          </div>
          <div className="flex-none">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-txt-subtle hover:text-txt-main transition-colors bg-bg-surface hover:bg-bg-hover px-3.5 py-1.5 rounded-md border border-border-strong shadow-md active:scale-95"
                title={t('blur.resetAllTitle')}
              >
                <RotateCcw size={12} />
                {t('blur.resetAll')}
              </button>
          </div>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-2 text-xs font-bold text-txt-main tracking-wide mb-3">
            <Wand2 size={16} className="text-brand-500" /> {t('blur.algorithm')}
          </div>
          <div className="grid grid-cols-3 gap-1.5 bg-bg-input p-1 rounded-lg border border-border-strong">
            {([
              { mode: 'blur' as const, label: t('blur.modeBlur') },
              { mode: 'hybrid' as const, label: t('blur.modeHybrid') },
              { mode: 'sttn' as const, label: t('blur.modeSttn') },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setBlurSettings({ mode })}
                className={cn(
                  "text-[10px] py-2 font-bold rounded-md transition-all duration-200",
                  blurSettings.mode === mode
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-txt-subtle hover:text-txt-muted hover:bg-bg-hover"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-txt-main tracking-wide mb-4">
            <ScanLine size={16} className="text-green-500" /> {t('blur.targetArea')}
          </div>
          <div className="space-y-5">
            <Slider
              label={t('blur.verticalPosition')}
              max={videoHeight}
              value={videoHeight - blurSettings.y}
              onChange={handleYChange}
            />
            <Slider
              label={t('blur.textHeight')}
              min={10} max={100} step={1}
              value={blurSettings.font_size}
              suffix="px"
              onChange={(e) => setBlurSettings({ font_size: Number(e.target.value) })}
            />
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-main/50">
               <Slider
                label={t('blur.widthRatio')}
                min={0.5} max={3.0} step={0.05}
                value={blurSettings.width_multiplier}
                suffix="x"
                onChange={(e) => setBlurSettings({ width_multiplier: Number(e.target.value) })}
               />
              <Slider
                label={t('blur.heightRatio')}
                min={0.5} max={3.0} step={0.05}
                value={blurSettings.height_multiplier ?? 1.0}
                suffix="x"
                onChange={(e) => setBlurSettings({ height_multiplier: Number(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-xl p-4 shadow-sm">
           <div className="flex items-center gap-2 text-xs font-bold text-txt-main tracking-wide mb-4">
            <Droplet size={16} className="text-brand-400" /> {t('blur.appearance')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Slider
              label={t('blur.intensity')}
              max={100}
               value={blurSettings.sigma}
              suffix="%"
              onChange={(e) => setBlurSettings({ sigma: Number(e.target.value) })}
            />
            <Slider
              label={t('blur.edgeSoftness')}
              max={100}
               value={blurSettings.feather}
              suffix="px"
              onChange={(e) => setBlurSettings({ feather: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-border-main bg-bg-panel shrink-0">
        {/* Once the finished video is ready, the job is over — never offer Stop. */}
        {!isProcessing || !activeBlurJobId || renderedVideoUrl ? (
          <Button
            variant="primary"
            className="w-full py-3.5 text-sm font-bold tracking-wide shadow-lg"
            icon={<Video size={18} />}
            onClick={handleRender}
            disabled={isProcessing}
          >
            {t('blur.startRender')}
          </Button>
        ) : (
          <Button
            variant="danger"
            className="w-full py-3.5 text-sm font-bold tracking-wide shadow-lg"
            icon={<Square size={18} fill="currentColor" />}
            onClick={() => stopBlurRender()}
          >
            {t('blur.stopRender')}
          </Button>
        )}
     </div>
    </div>
  );
};