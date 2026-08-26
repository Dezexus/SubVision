import React, { useEffect, useRef } from 'react';
import { Video, RotateCcw, Wand2, ScanLine, Droplet, Loader2, Square } from 'lucide-react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { useBlurStore } from '../../../store/blurStore';
import { Slider, Button } from '../../../shared/ui';
import { cn } from '../../../shared/lib';
import { useBlurPreview } from '../hooks/useBlurPreview';
import { useStartBlurRender } from '../mutations/useStartBlurRender';
import { useStopBlurRender } from '../mutations/useStopBlurRender';
import { useDefaultBlurSettingsQuery } from '../queries/useDefaultBlurSettingsQuery';

/**
 * Control panel for configuring and starting the smart blur rendering process.
 */
export const BlurControlPanel = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const roi = useVideoStore((s) => s.roi);

  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const activeBlurJobId = useProcessingStore((s) => s.activeBlurJobId);
  const updateProgress = useProcessingStore((s) => s.updateProgress);
  const subtitles = useProcessingStore((s) => s.subtitles);

  const blurSettings = useBlurStore((s) => s.blurSettings);
  const setBlurSettings = useBlurStore((s) => s.setBlurSettings);
  const setBlurPreviewUrl = useBlurStore((s) => s.setBlurPreviewUrl);

  const userAdjustedY = useRef(false);
  const initialized = useRef(false);

  const { data: defaultBlurSettings } = useDefaultBlurSettingsQuery();
  const { isPreviewUpdating } = useBlurPreview(metadata, blurSettings, subtitles, currentFrameIndex, setBlurPreviewUrl);
  const { execute: startBlurRender } = useStartBlurRender();
  const { execute: stopBlurRender } = useStopBlurRender();

  const videoHeight = metadata?.height || 1080;

  useEffect(() => {
    if (defaultBlurSettings && !initialized.current) {
      setBlurSettings(defaultBlurSettings);
      initialized.current = true;
    }
  }, [defaultBlurSettings, setBlurSettings]);

  useEffect(() => {
    if (metadata && !userAdjustedY.current && roi[1] > 0) {
      const newY = roi[1] + roi[3];
      setBlurSettings({ y: Math.max(0, Math.min(videoHeight, newY)) });
    }
  }, [roi, metadata, videoHeight, setBlurSettings]);

  const handleRender = () => {
    if (!metadata || !clientId) return;
    updateProgress(0, metadata.total_frames, "Starting...");
    startBlurRender({
      filename: metadata.filename,
      client_id: clientId,
      subtitles: subtitles,
      blur_settings: blurSettings,
    });
  };

  const handleReset = () => {
    if (defaultBlurSettings) {
      setBlurSettings(defaultBlurSettings);
      userAdjustedY.current = false;
    }
  };

  const handleYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    userAdjustedY.current = true;
    const newY = videoHeight - Number(e.target.value);
    setBlurSettings({ y: Math.max(0, Math.min(videoHeight, newY)) });
  };

  return (
    <div className="flex flex-col h-full bg-bg-main relative">
      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
        <div className="w-full bg-bg-panel p-2 rounded-xl border border-border-main shadow-sm flex items-center relative overflow-hidden">
          <div className="flex-1 flex items-center">
            {isPreviewUpdating ? (
              <span className="inline-flex items-center gap-1.5 text-[10px] text-brand-500 font-mono bg-brand-500/10 px-2.5 py-1 rounded shadow-inner" title="Preview is being updated.">
                <Loader2 size={12} className="animate-spin" />
                UPDATING
              </span>
            ) : (
                <div className="w-32" />
            )}
          </div>
          <div className="flex-none">
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-txt-subtle hover:text-txt-main transition-colors bg-bg-surface hover:bg-bg-hover px-3.5 py-1.5 rounded-md border border-border-strong shadow-md active:scale-95"
                title="Reset all blur settings to defaults"
              >
                <RotateCcw size={12} />
                RESET ALL
              </button>
          </div>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center gap-2 text-xs font-bold text-txt-main tracking-wide mb-3">
            <Wand2 size={16} className="text-brand-500" /> Algorithm
          </div>
          <div className="grid grid-cols-2 gap-1.5 bg-bg-input p-1 rounded-lg border border-border-strong">
            {([
              { mode: 'blur' as const, label: 'BOX BLUR' },
              { mode: 'hybrid' as const, label: 'HYBRID' },
              { mode: 'propainter' as const, label: 'PROPAINTER' },
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

        {blurSettings.mode === 'propainter' && (
          <div className="bg-bg-panel border border-border-main rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-bold text-txt-main tracking-wide mb-4">
              <Wand2 size={16} className="text-purple-400" /> ProPainter
            </div>
            <div className="space-y-4">
              <Slider
                label="Neighbor Length"
                min={4} max={12} step={2}
                value={blurSettings.propainter_neighbor_length ?? 6}
                suffix="fr"
                onChange={(e) => setBlurSettings({ propainter_neighbor_length: Number(e.target.value) })}
              />
              <Slider
                label="Subvideo Length"
                min={20} max={80} step={10}
                value={blurSettings.propainter_subvideo_length ?? 30}
                suffix="fr"
                onChange={(e) => setBlurSettings({ propainter_subvideo_length: Number(e.target.value) })}
              />
              <Slider
                label="ROI Padding"
                min={16} max={64} step={8}
                value={blurSettings.propainter_roi_pad ?? 32}
                suffix="px"
                onChange={(e) => setBlurSettings({ propainter_roi_pad: Number(e.target.value) })}
              />
              <label className="flex items-center gap-2 text-xs text-txt-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={blurSettings.propainter_fp16 ?? true}
                  onChange={(e) => setBlurSettings({ propainter_fp16: e.target.checked })}
                  className="rounded border-border-strong"
                />
                FP16 (рекомендуется для 6 GB VRAM)
              </label>
            </div>
          </div>
        )}

        <div className="bg-bg-panel border border-border-main rounded-xl p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-bold text-txt-main tracking-wide mb-4">
            <ScanLine size={16} className="text-green-500" /> Target Area
          </div>
          <div className="space-y-5">
            <Slider
              label="Vertical Position (Y)"
              max={videoHeight}
              value={videoHeight - blurSettings.y}
              onChange={handleYChange}
            />
            <Slider
              label="Text Height Base"
              min={10} max={100} step={1}
              value={blurSettings.font_size}
              suffix="px"
              onChange={(e) => setBlurSettings({ font_size: Number(e.target.value) })}
            />
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border-main/50">
               <Slider
                label="Width Ratio"
                min={0.5} max={3.0} step={0.05}
                value={blurSettings.width_multiplier}
                suffix="x"
                onChange={(e) => setBlurSettings({ width_multiplier: Number(e.target.value) })}
               />
              <Slider
                label="Height Ratio"
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
            <Droplet size={16} className="text-brand-400" /> Appearance
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Slider
              label="Intensity (Sigma)"
              max={100}
               value={blurSettings.sigma}
              suffix="%"
              onChange={(e) => setBlurSettings({ sigma: Number(e.target.value) })}
            />
            <Slider
              label="Edge Softness"
              max={100}
               value={blurSettings.feather}
              suffix="px"
              onChange={(e) => setBlurSettings({ feather: Number(e.target.value) })}
            />
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-border-main bg-bg-panel shrink-0">
        {!isProcessing || !activeBlurJobId ? (
          <Button
            variant="primary"
            className="w-full py-3.5 text-sm font-bold tracking-wide shadow-lg"
            icon={<Video size={18} />}
            onClick={handleRender}
            disabled={isProcessing}
          >
            START RENDER
          </Button>
        ) : (
          <Button
            variant="danger"
            className="w-full py-3.5 text-sm font-bold tracking-wide shadow-lg"
            icon={<Square size={18} fill="currentColor" />}
            onClick={() => stopBlurRender()}
          >
            STOP RENDER
          </Button>
        )}
     </div>
    </div>
  );
};