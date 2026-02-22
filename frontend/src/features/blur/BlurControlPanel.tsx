/**
 * Control panel for configuring blur effect geometry and appearance parameters.
 * Uses a card-based layout for logical grouping of settings without redundant headers.
 */
import React, { useEffect } from 'react';
import {
  Video, RotateCcw, Wand2,
  ScanLine, BoxSelect, Droplet, Loader2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Slider } from '../../components/ui/Slider';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';
import { useBlurPreview } from './hooks/useBlurPreview';

const DEFAULTS = {
  mode: 'hybrid',
  y: 912,
  font_size: 22,
  padding_x: 60,
  padding_y: 2.0,
  sigma: 5,
  feather: 40,
  width_multiplier: 1.0
};

export const BlurControlPanel = () => {
  const {
    metadata,
    blurSettings,
    setBlurSettings,
    subtitles,
    clientId,
    isProcessing,
    setProcessing,
    updateProgress,
    addLog,
    roi,
    currentFrameIndex,
    setBlurPreviewUrl
  } = useAppStore();

  const { isPreviewUpdating } = useBlurPreview(
    metadata,
    blurSettings,
    subtitles,
    currentFrameIndex,
    setBlurPreviewUrl
  );

  const videoHeight = metadata?.height || 1080;

  useEffect(() => {
    if (metadata && blurSettings.y === 900 && roi[1] > 0) {
        setBlurSettings({ y: roi[1] + roi[3] });
    }
  }, [roi, metadata, blurSettings.y, setBlurSettings]);

  const handleRender = async () => {
    if (!metadata) return;

    setProcessing(true);
    updateProgress(0, metadata.total_frames, "Starting...");
    addLog('--- Starting Smart Render ---');

    try {
      await api.renderBlurVideo({
        filename: metadata.filename,
        client_id: clientId,
        subtitles: subtitles,
        blur_settings: blurSettings
      });
    } catch (e) {
      console.error(e);
      addLog('Error: Render failed to start.');
      setProcessing(false);
    }
  };

  const handleReset = () => {
      setBlurSettings(DEFAULTS);
  };

  return (
    <div className="flex flex-col h-full bg-bg-main">
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">

        {/* Compact Actions Row */}
        <div className="flex justify-between items-center mb-1">
            {isPreviewUpdating ? (
                <div className="flex items-center gap-1.5 text-[10px] text-brand-500 font-mono animate-pulse">
                    <Loader2 size={10} className="animate-spin" />
                    UPDATING PREVIEW
                </div>
            ) : <div />}
            <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-[10px] font-bold text-txt-subtle hover:text-txt-main transition-colors"
                title="Reset all blur settings to defaults"
            >
                <RotateCcw size={10} />
                RESET ALL
            </button>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-lg p-3 space-y-3 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold text-txt-subtle uppercase tracking-wider mb-2">
                 <Wand2 size={14} className="text-brand-500" /> Algorithm
            </div>
            <div className="flex bg-bg-track p-1 rounded-md border border-border-main gap-1">
                <button
                    onClick={() => setBlurSettings({ mode: 'blur' })}
                    className={cn(
                      "flex-1 text-[10px] py-1.5 font-bold rounded transition",
                      blurSettings.mode === 'blur' ? "bg-bg-surface text-white shadow-sm" : "text-txt-subtle hover:text-txt-muted"
                    )}
                >
                    BOX BLUR
                </button>
                <button
                    onClick={() => setBlurSettings({ mode: 'hybrid' })}
                    className={cn(
                      "flex-1 text-[10px] py-1.5 font-bold rounded transition",
                      blurSettings.mode === 'hybrid' ? "bg-brand-500 text-white shadow-sm" : "text-txt-subtle hover:text-txt-muted"
                    )}
                >
                    HYBRID INPAINT
                </button>
            </div>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-lg p-3 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold text-txt-subtle uppercase tracking-wider mb-1">
                 <ScanLine size={14} className="text-green-500" /> Target Area
            </div>
            <div className="space-y-4">
                <Slider
                  label="Vertical Position (Y)"
                  max={videoHeight}
                  value={videoHeight - blurSettings.y}
                  onChange={(e) => setBlurSettings({ y: videoHeight - Number(e.target.value) })}
                />
                <Slider
                  label="Text Height"
                  min={10} max={100} step={1}
                  value={blurSettings.font_size}
                  suffix="px"
                  onChange={(e) => setBlurSettings({ font_size: Number(e.target.value) })}
                />
                <Slider
                  label="Width Ratio"
                  min={0.5} max={3.0} step={0.05}
                  value={blurSettings.width_multiplier || 1.0}
                  suffix="x"
                  onChange={(e) => setBlurSettings({ width_multiplier: Number(e.target.value) })}
                />
            </div>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-lg p-3 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold text-txt-subtle uppercase tracking-wider mb-1">
                 <BoxSelect size={14} className="text-red-500" /> Padding Coverage
            </div>
            <div className="grid grid-cols-2 gap-4">
                <Slider
                  label="Spread X"
                  max={150}
                  value={blurSettings.padding_x}
                  suffix="px"
                  onChange={(e) => setBlurSettings({ padding_x: Number(e.target.value) })}
                />
                <Slider
                  label="Spread Y"
                  min={0} max={4.0} step={0.1}
                  value={blurSettings.padding_y}
                  suffix="x"
                  onChange={(e) => setBlurSettings({ padding_y: Number(e.target.value) })}
                />
            </div>
        </div>

        <div className="bg-bg-panel border border-border-main rounded-lg p-3 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-bold text-txt-subtle uppercase tracking-wider mb-1">
                <Droplet size={14} className="text-brand-400" /> Appearance
            </div>
            <div className="space-y-4">
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

      <div className="p-4 border-t border-border-main bg-bg-panel">
        <Button
          variant="primary"
          className="w-full py-3 text-sm font-semibold tracking-wide shadow-md"
          icon={<Video size={16} />}
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
