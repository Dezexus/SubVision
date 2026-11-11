import React, { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Video, RotateCcw, Wand2, ScanLine, Droplet, Loader2, Square, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { allTrackSettings, LINKED_KEYS, settingsForTrack, useBlurStore } from '../../../store/blurStore';
import { useTrackLabel } from '../../../hooks/useTrackLabel';
import { Slider, Button, Switch } from '../../../shared/ui';
import { cn, countTracks, subtitleAt, trackColor, trackOf } from '../../../shared/lib';
import { calculateTextRect, PLACEHOLDER_TEXT } from '../../../shared/lib/textGeometry';
import { useBlurPreview } from '../hooks/useBlurPreview';
import { useStartBlurRender } from '../mutations/useStartBlurRender';
import { useStopBlurRender } from '../mutations/useStopBlurRender';
import { useDefaultBlurSettingsQuery } from '../queries/useDefaultBlurSettingsQuery';
import { useTranslation } from '../../../i18n';
import type { BlurSettings } from '../../../types';

const isLinked = (key: string): boolean => (LINKED_KEYS as readonly string[]).includes(key);

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
  const linkAppearance = useBlurStore((s) => s.linkAppearance);
  const setLinkAppearance = useBlurStore((s) => s.setLinkAppearance);

  const trackCount = countTracks(rois.length, subtitles);
  const track = Math.min(activeTrack, trackCount - 1);
  const blurSettings = settingsForTrack(trackState, track);
  const linked = linkAppearance && trackCount > 1;

  /** Apply a change: linked keys go to every track, the rest to the current one. */
  const setBlurSettings = (updates: Partial<BlurSettings>) => {
    const own: Partial<BlurSettings> = {};
    const shared: Partial<BlurSettings> = {};
    for (const [key, value] of Object.entries(updates)) {
      Object.assign(linked && isLinked(key) ? shared : own, { [key]: value });
    }
    if (Object.keys(own).length) setTrackSettings(track, own);
    if (Object.keys(shared).length) {
      for (let i = 0; i < trackCount; i++) setTrackSettings(i, shared);
    }
  };

  const pickLinked = (settings: BlurSettings): Partial<BlurSettings> =>
    Object.fromEntries(LINKED_KEYS.map((key) => [key, settings[key]]));

  const handleLinkChange = (value: boolean) => {
    setLinkAppearance(value);
    // Turning it on makes every track look like the current one.
    if (value) {
      const shared = pickLinked(settingsForTrack(useBlurStore.getState(), track));
      for (let i = 0; i < trackCount; i++) if (i !== track) setTrackSettings(i, shared);
    }
  };

  // Tracks the user positioned; the others follow their ROI (bottom edge, center).
  const userPositioned = useRef(new Set<number>());

  const { data: defaultBlurSettings } = useDefaultBlurSettingsQuery();
  const { isPreviewUpdating } = useBlurPreview(metadata, trackState, blurSettings, subtitles, currentFrameIndex, setBlurPreviewUrl);
  const { execute: startBlurRender } = useStartBlurRender();
  const { execute: stopBlurRender } = useStopBlurRender();

  const videoHeight = metadata?.height || 1080;
  const videoWidth = metadata?.width || 1920;
  const halfWidth = Math.round(videoWidth / 2);

  const clampOffset = (value: number) => Math.max(-halfWidth, Math.min(halfWidth, Math.round(value)));

  /**
   * Zone position that matches a region: baseline at its bottom, anchored at
   * its left edge, center or right edge depending on the track's alignment.
   */
  const positionFromRoi = (i: number): Partial<BlurSettings> | null => {
    const roi = rois[i];
    if (!roi || roi[2] <= 0 || roi[3] <= 0) return null;
    const align = settingsForTrack(useBlurStore.getState(), i).align ?? 'center';
    const anchor = align === 'left' ? roi[0] : align === 'right' ? roi[0] + roi[2] : roi[0] + roi[2] / 2;
    return {
      y: Math.max(0, Math.min(videoHeight, roi[1] + roi[3])),
      x_offset: clampOffset(anchor - videoWidth / 2),
    };
  };

  /** Switch alignment without moving the zone: re-anchor at its current edge. */
  const handleAlignChange = (align: BlurSettings['align']) => {
    if (align === blurSettings.align || !metadata) return;
    const time = currentFrameIndex / metadata.fps;
    const cue = subtitleAt(subtitles.filter((s) => trackOf(s) === track), time);
    const rect = calculateTextRect(cue?.text ?? PLACEHOLDER_TEXT, videoWidth, videoHeight, blurSettings);
    const anchor = align === 'left' ? rect.x : align === 'right' ? rect.x + rect.w : rect.x + rect.w / 2;
    setTrackSettings(track, { align, x_offset: clampOffset(anchor - videoWidth / 2) });
  };

  // (Re)apply server defaults once they load or after a project reset cleared them.
  useEffect(() => {
    if (defaultBlurSettings && !storeDefaults) {
      setDefaultBlurSettings(defaultBlurSettings);
      userPositioned.current.clear();
    }
  }, [defaultBlurSettings, storeDefaults, setDefaultBlurSettings]);

  useEffect(() => {
    if (!metadata || !storeDefaults) return;
    rois.forEach((_, i) => {
      const position = positionFromRoi(i);
      if (!position || userPositioned.current.has(i)) return;
      const current = settingsForTrack(useBlurStore.getState(), i);
      if (current.y !== position.y || (current.x_offset ?? 0) !== position.x_offset) setTrackSettings(i, position);
    });
    // positionFromRoi only reads rois and the video size listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rois, metadata, videoHeight, videoWidth, storeDefaults, setTrackSettings]);

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
    userPositioned.current.delete(track);
    const position = positionFromRoi(track);
    if (position) setTrackSettings(track, position);
    if (linked) {
      const shared = pickLinked(settingsForTrack(useBlurStore.getState(), track));
      for (let i = 0; i < trackCount; i++) if (i !== track) setTrackSettings(i, shared);
    }
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userPositioned.current.add(track);
    const newY = videoHeight - Number(e.target.value);
    setBlurSettings({ y: Math.max(0, Math.min(videoHeight, newY)) });
  };

  const handleXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userPositioned.current.add(track);
    setBlurSettings({ x_offset: clampOffset(Number(e.target.value)) });
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
        {trackCount > 1 && (
          <div className="bg-bg-panel border border-border-main rounded-xl px-4 py-1.5 shadow-sm">
            <Switch checked={linkAppearance} onChange={handleLinkChange} label={t('blur.linkTracks')} />
            <p className="text-[11px] text-txt-subtle pb-1.5">{t('blur.linkTracksHint')}</p>
          </div>
        )}
        <div className="bg-bg-panel border border-border-main rounded-xl p-4 shadow-sm relative overflow-hidden">
          {/* Reset and the preview spinner live in this header instead of a card of their own. */}
          <div className="flex items-center gap-2 mb-3">
            <Wand2 size={16} className="text-brand-500" aria-hidden />
            <span className="text-xs font-bold text-txt-main tracking-wide">{t('blur.algorithm')}</span>
            {isPreviewUpdating && (
              <Loader2 size={13} className="animate-spin text-brand-500" aria-label={t('blur.updating')} />
            )}
            <button
              onClick={handleReset}
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold text-txt-subtle hover:text-txt-main hover:bg-bg-hover px-2 py-1 rounded-md transition-colors"
              title={t('blur.resetAllTitle')}
            >
              <RotateCcw size={12} aria-hidden />
              {t('blur.resetAll')}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 bg-bg-input p-1 rounded-lg border border-border-strong">
            {([
              { mode: 'blur' as const, label: t('blur.modeBlur') },
              { mode: 'hybrid' as const, label: t('blur.modeHybrid') },
            ]).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setBlurSettings({ mode })}
                className={cn(
                  "text-[11px] py-2 font-bold rounded-md transition-all duration-200",
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
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-txt-muted">{t('blur.align')}</div>
              <div role="radiogroup" aria-label={t('blur.align')} className="grid grid-cols-3 gap-1.5 bg-bg-input p-1 rounded-lg border border-border-strong">
                {([
                  { align: 'left' as const, icon: AlignLeft, label: t('blur.alignLeft') },
                  { align: 'center' as const, icon: AlignCenter, label: t('blur.alignCenter') },
                  { align: 'right' as const, icon: AlignRight, label: t('blur.alignRight') },
                ]).map(({ align, icon: Icon, label: text }) => (
                  <button
                    key={align}
                    type="button"
                    role="radio"
                    aria-checked={(blurSettings.align ?? 'center') === align}
                    onClick={() => handleAlignChange(align)}
                    className={cn(
                      'flex items-center justify-center gap-1.5 text-[11px] py-1.5 font-semibold rounded-md transition-colors',
                      (blurSettings.align ?? 'center') === align
                        ? 'bg-brand-500 text-white shadow-sm'
                        : 'text-txt-subtle hover:text-txt-muted hover:bg-bg-hover',
                    )}
                  >
                    <Icon size={13} aria-hidden />
                    {text}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-txt-subtle leading-snug">{t('blur.alignHint')}</p>
            </div>
            <Slider
              label={t('blur.horizontalPosition')}
              min={-halfWidth}
              max={halfWidth}
              value={blurSettings.x_offset ?? 0}
              onChange={handleXChange}
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