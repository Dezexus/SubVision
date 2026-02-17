import React, { useEffect, useState, useRef } from 'react';
import {
  Sliders, Video, RotateCcw,
  MoveVertical, Maximize, Droplet,
  ScanLine, BoxSelect, Loader2
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Slider } from '../../components/ui/Slider';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { cn } from '../../utils/cn';

// Default "DaVinci" values for Reset functionality
const DEFAULTS = {
  y: 912,
  font_size: 22,
  padding_x: 60,
  padding_y: 2.0,
  sigma: 10,
  feather: 40
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

  const videoHeight = metadata?.height || 1080;

  // Initial Auto-Positioning logic (only runs once if Y is default)
  useEffect(() => {
    if (metadata && blurSettings.y === 900 && roi[1] > 0) {
        setBlurSettings({ y: roi[1] + roi[3] });
    }
  }, [roi, metadata, blurSettings.y, setBlurSettings]);

  // Auto-Preview Logic
  useEffect(() => {
      if (!metadata) return;

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
              setBlurPreviewUrl(url);
          } catch (e) {
              console.error("Preview update failed", e);
          } finally {
              setIsPreviewUpdating(false);
          }
      }, 500); // 500ms debounce

      return () => {
          if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      };
  }, [blurSettings, currentFrameIndex, metadata, subtitles, setBlurPreviewUrl]);

  const handleRender = async () => {
    if (!metadata) return;

    setProcessing(true);
    updateProgress(0, metadata.total_frames, "Starting...");
    addLog('--- Starting Smart Blur Render ---');

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
      {/* Header */}
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
                title="Reset to Defaults"
            >
                <RotateCcw size={14} />
            </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">

        {/* SECTION 1: GEOMETRY */}
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
            </div>
        </div>

        {/* SECTION 2: COVERAGE */}
        <div className="space-y-4">
            <div className="flex items-center gap-2 text-[11px] font-bold text-[#858585] uppercase tracking-wider">
                 <BoxSelect size={14} /> Blur Coverage (Red)
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

        {/* SECTION 3: APPEARANCE */}
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

      {/* Footer Action */}
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
