import React, { useEffect, useState, useRef } from 'react';
import {
  Sliders, Video, RotateCcw,
  MoveVertical, Maximize, Droplet,
  ScanLine, BoxSelect, Loader2,
  Wand2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Slider } from '../../components/ui/Slider';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';

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

  const [isPreviewUpdating, setIsPreviewUpdating] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const currentUrlRef = useRef<string | null>(null);

  const videoHeight = metadata?.height || 1080;

  useEffect(() => {
    if (metadata && blurSettings.y === 900 && roi[1] > 0) {
        setBlurSettings({ y: roi[1] + roi[3] });
    }
  }, [roi, metadata, blurSettings.y, setBlurSettings]);

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
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      <div className="p-4 border-b border-[#333333] flex justify-between items-center bg-[#252526]">
        <div className="flex items-center gap-2 text-[#F0F0F0]">
            <Sliders size={16} className="text-brand-400" />
            <h3 className="font-bold uppercase text-xs tracking-widest">Effect Controls</h3>
        </div>
        <div className="flex items-center gap-3">
            {isPreviewUpdating && (
                <div className="flex items-center gap-1.5 text-[10px] text-[#007acc] font-mono animate-pulse">
                    <Loader2 size={10} className="animate-spin" />
                    PREVIEW
                </div>
            )}
            <button
                onClick={handleReset}
                className="p-1.5 text-[#858585] hover:text-white hover:bg-[#333333] rounded transition-colors"
            >
                <RotateCcw size={14} />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">

        <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#858585] uppercase tracking-wider">
                 <Wand2 size={14} /> Obscuring Mode
            </div>
            <div className="flex bg-[#18181b] p-1 rounded-md border border-[#333333] gap-1">
                <button
                    onClick={() => setBlurSettings({ mode: 'blur' })}
                    className={cn("flex-1 text-[10px] py-1.5 font-bold rounded transition", blurSettings.mode === 'blur' ? "bg-[#333333] text-white shadow" : "text-[#858585] hover:text-[#C5C5C5]")}
                >
                    BOX BLUR
                </button>
                <button
                    onClick={() => setBlurSettings({ mode: 'hybrid' })}
                    className={cn("flex-1 text-[10px] py-1.5 font-bold rounded transition", blurSettings.mode === 'hybrid' ? "bg-[#007acc] text-white shadow" : "text-[#858585] hover:text-[#C5C5C5]")}
                >
                    HYBRID
                </button>
            </div>
            {blurSettings.mode === 'hybrid' && (
                <p className="text-[10px] text-[#858585] italic leading-tight mt-1">
                    Best quality. Reconstructs background using Inpaint and smooths artifacts with a light Blur.
                </p>
            )}
        </div>

        <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#858585] uppercase tracking-wider">
                 <ScanLine size={14} /> Target Geometry (Green)
            </div>

            <div className="pl-2 border-l-2 border-[#333333] space-y-4 ml-1">
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

        <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#858585] uppercase tracking-wider">
                 <BoxSelect size={14} /> Effect Coverage (Red)
            </div>

            <div className="pl-2 border-l-2 border-[#333333] space-y-4 ml-1">
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
        </div>

        <div className="h-px bg-[#333333]" />

        <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#858585] uppercase tracking-wider">
                <Droplet size={14} /> Appearance
            </div>

            <div className="bg-[#252526] p-3 rounded border border-[#333333] space-y-4">
                <Slider
                label="Intensity"
                max={100}
                value={blurSettings.sigma}
                suffix="%"
                onChange={(e) => setBlurSettings({ sigma: Number(e.target.value) })}
                />
                <Slider
                label="Feather / Softness"
                max={100}
                value={blurSettings.feather}
                suffix="px"
                onChange={(e) => setBlurSettings({ feather: Number(e.target.value) })}
                />
            </div>
        </div>
      </div>

      <div className="p-4 border-t border-[#333333] bg-[#252526]">
        <Button
          variant="primary"
          className="w-full py-3 text-sm font-semibold tracking-wide shadow-lg hover:shadow-blue-500/20 transition-all"
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
