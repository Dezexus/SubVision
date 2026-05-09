import React, { useEffect, useRef } from 'react';
import { Video, RotateCcw, Wand2, ScanLine, BoxSelect, Droplet, Loader2, CheckCircle } from 'lucide-react';
import { useVideoStore } from '../../store/videoStore';
import { useProcessingStore } from '../../store/processingStore';
import { useBlurStore } from '../../store/blurStore';
import { Slider } from '../../components/ui/Slider';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';
import { useBlurPreview } from './hooks/useBlurPreview';
import { useStartBlurRender } from '../../commands/useStartBlurRender';

export const BlurControlPanel = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const roi = useVideoStore((s) => s.roi);

  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const setProcessing = useProcessingStore((s) => s.setProcessing);
  const updateProgress = useProcessingStore((s) => s.updateProgress);
  const addLog = useProcessingStore((s) => s.addLog);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const setActiveBlurJobId = useProcessingStore((s) => s.setActiveBlurJobId);

  const blurSettings = useBlurStore((s) => s.blurSettings);
  const defaultBlurSettings = useBlurStore((s) => s.defaultBlurSettings);
  const setBlurSettings = useBlurStore((s) => s.setBlurSettings);
  const setDefaultBlurSettings = useBlurStore((s) => s.setDefaultBlurSettings);
  const setBlurPreviewUrl = useBlurStore((s) => s.setBlurPreviewUrl);

  const userAdjustedY = useRef(false);
  const { isPreviewUpdating } = useBlurPreview(metadata, blurSettings, subtitles, currentFrameIndex, setBlurPreviewUrl);
  const { execute: startBlurRender } = useStartBlurRender();

  const videoHeight = metadata?.height || 1080;

  useEffect(() => {
    const fetchDefaults = async () => {
      try {
        const defaults = await api.getDefaultBlurSettings();
        setDefaultBlurSettings(defaults);
        setBlurSettings(defaults);
      } catch (error) {
        console.error(error);
      }
    };
    if (!defaultBlurSettings) {
      fetchDefaults();
    }
  }, [defaultBlurSettings, setDefaultBlurSettings, setBlurSettings]);

  useEffect(() => {
    if (metadata && !userAdjustedY.current && roi[1] > 0) {
      const newY = roi[1] + roi[3];
      setBlurSettings({ y: Math.max(0, Math.min(videoHeight, newY)) });
    }
  }, [roi, metadata, videoHeight, setBlurSettings]);

  const handleRender = async () => {
    if (!metadata || !clientId) return;
    setProcessing(true);
    updateProgress(0, metadata.total_frames, "Starting...");
    addLog('--- Starting Smart Render ---');
    try {
      const { job_id } = await startBlurRender({
        filename: metadata.filename,
        client_id: clientId,
        subtitles: subtitles,
        blur_settings: blurSettings,
      });
      setActiveBlurJobId(job_id);
    } catch (e) {
      addLog('Error: Render failed to start.');
      setProcessing(false);
    }
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
          <div className="relative flex bg-bg-input p-1 rounded-lg border border-border-strong z-10">
            <button
              onClick={() => setBlurSettings({ mode: 'blur' })}
              className={cn(
                "relative flex-1 text-xs py-2 font-bold rounded-md transition-all duration-200 z-10",
                blurSettings.mode === 'blur' ? "text-white" : "text-txt-subtle hover:text-txt-muted"
              )}
            >
              BOX BLUR
            </button>
            <button
              onClick={() => setBlurSettings({ mode: 'hybrid' })}
              className={cn(
                "relative flex-1 text-xs py-2 font-bold rounded-md transition-all duration-200 z-10",
                blurSettings.mode === 'hybrid' ? "text-white" : "text-txt-subtle hover:text-txt-muted"
              )}
            >
              HYBRID INPAINT
            </button>
            <div 
              className={cn(
                "absolute left-1 top-1 bottom-1 w-[calc(50%-4px)] bg-brand-500 rounded-md transition-transform duration-300 ease-out shadow-sm",
                blurSettings.mode === 'blur' ? "translate-x-0" : "translate-x-full"
              )}
            />
          </div>
        </div>

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
        <Button
          variant="primary"
          className="w-full py-3.5 text-sm font-bold tracking-wide shadow-lg"
          icon={<Video size={18} />}
          onClick={handleRender}
          isLoading={isProcessing}
          disabled={isProcessing}
        >
          START RENDER
        </Button>
      </div>
    </div>
  );
};