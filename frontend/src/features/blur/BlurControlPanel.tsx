import React, { useEffect } from 'react';
import { Sliders, Video, Type, Feather } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Slider } from '../../components/ui/Slider';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';

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
    roi
  } = useAppStore();

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

  return (
    <div className="p-5 space-y-6 text-txt-main">
      <div className="flex items-center gap-2 mb-4 text-[#F0F0F0]">
        <Sliders size={18} className="text-brand-400" />
        <h3 className="font-bold uppercase text-sm tracking-wider">Smart Blur Config</h3>
      </div>

      <p className="text-xs text-gray-500 mb-4">
         The system calculates the blur area automatically for each subtitle based on these settings.
      </p>

      <div className="space-y-4">
        <Slider
          label="Vertical Position (Elevation)"
          max={videoHeight}
          // INVERTED: Display (Height - Y). 0 on slider = Bottom of screen.
          value={videoHeight - blurSettings.y}
          valueDisplay={videoHeight - blurSettings.y}
          // INVERTED: Convert slider value back to Y-coordinate
          onChange={(e) => setBlurSettings({ y: videoHeight - Number(e.target.value) })}
        />

        <div className="h-px bg-[#333333] my-4" />

        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[#C5C5C5] uppercase">
             <Type size={14} /> Font Estimator
        </div>

        <Slider
          label="Font Scale"
          min={0.5}
          max={4.0}
          step={0.1}
          value={blurSettings.font_scale}
          valueDisplay={blurSettings.font_scale.toFixed(1)}
          onChange={(e) => setBlurSettings({ font_scale: Number(e.target.value) })}
        />

        <div className="space-y-4">
            <Slider
              label="Padding X"
              max={100}
              value={blurSettings.padding_x}
              valueDisplay={`${blurSettings.padding_x}px`}
              onChange={(e) => setBlurSettings({ padding_x: Number(e.target.value) })}
            />
            <Slider
              label="Padding Y (Relative)"
              min={0}
              max={3.0}
              step={0.1}
              value={blurSettings.padding_y}
              valueDisplay={`${blurSettings.padding_y.toFixed(1)}x`} // Display as multiplier
              onChange={(e) => setBlurSettings({ padding_y: Number(e.target.value) })}
            />
        </div>

        <div className="h-px bg-[#333333] my-4" />

        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[#C5C5C5] uppercase">
             <Feather size={14} /> Effects
        </div>

        <Slider
          label="Blur Strength"
          max={100}
          value={blurSettings.sigma}
          valueDisplay={`${blurSettings.sigma}%`}
          onChange={(e) => setBlurSettings({ sigma: Number(e.target.value) })}
        />

        <Slider
          label="Edge Softness (Feather)"
          max={50}
          value={blurSettings.feather}
          valueDisplay={`${blurSettings.feather}px`}
          onChange={(e) => setBlurSettings({ feather: Number(e.target.value) })}
        />
      </div>

      <div className="pt-4 border-t border-[#333333]">
        <Button
          variant="primary"
          className="w-full py-3"
          icon={<Video size={16} />}
          onClick={handleRender}
          isLoading={isProcessing}
          disabled={isProcessing}
        >
          RENDER VIDEO
        </Button>
      </div>
    </div>
  );
};
