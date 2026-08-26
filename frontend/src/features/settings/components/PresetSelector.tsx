import React from 'react';
import { Gem, Gauge } from 'lucide-react';
import { useConfigStore } from '../../../store/configStore';
import { usePresetsQuery } from '../queries/usePresetsQuery';
import type { Preset } from '../../../types';

const PRESET_ICONS: Record<string, React.ReactNode> = {
  '🎯 Quality': <Gem size={20} />,
  '⚖️ Balance': <Gauge size={20} />,
};

export const PresetSelector: React.FC = () => {
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const { data: presets = [], isLoading } = usePresetsQuery();

  const applyPreset = (preset: Preset) => {
    setConfig({
      preset: preset.id,
      step: preset.config.step,
      conf_threshold: preset.config.min_conf,
      scale_factor: preset.config.scale_factor,
      denoise_strength: preset.config.denoise_strength,
      smart_skip: preset.config.smart_skip,
      motion_mse_thresh: preset.config.motion_mse_thresh,
      gap_tolerance: preset.config.gap_tolerance,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-bold text-txt-subtle uppercase tracking-wider">Processing Mode</h3>
      <div className="grid grid-cols-1 gap-3">
        {isLoading && (
          <p className="text-xs text-txt-dim px-1">Loading presets...</p>
        )}
        {presets.map((preset) => {
          const isActive = config.preset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset)}
              className={`relative flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left overflow-hidden group ${
                isActive
                  ? 'border-brand-500 bg-brand-500/10 shadow-[0_0_15px_rgba(0,122,204,0.1)] scale-[1.02]'
                  : 'border-border-main bg-bg-panel hover:border-border-strong hover:bg-bg-hover'
              }`}
            >
              <div className={`mt-0.5 transition-colors ${isActive ? 'text-brand-400' : 'text-txt-dim group-hover:text-txt-subtle'}`}>
                {PRESET_ICONS[preset.id] ?? <Gauge size={20} />}
              </div>
              <div className="flex flex-col">
                <span className={`text-sm font-bold tracking-wide ${isActive ? 'text-brand-400' : 'text-txt-main'}`}>
                  {preset.label}
                </span>
                <span className={`text-xs mt-1 leading-relaxed ${isActive ? 'text-txt-main/90' : 'text-txt-subtle'}`}>
                  {preset.desc}
                </span>
              </div>
              {isActive && (
                <div className="absolute top-0 left-0 w-1 h-full bg-brand-500 rounded-l-xl" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
