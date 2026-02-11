import React from 'react';
import { Settings2 } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { Slider } from '../../../components/ui/Slider';
import { Switch } from '../../../components/ui/Switch';

export const AdvancedSettings = () => {
  const { config, updateConfig } = useAppStore();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-txt-muted mb-4">
        <Settings2 size={14} /> 
        <span>Fine Tuning</span>
      </div>

      {/* Always Visible Sliders */}
      <Slider
        label="Min Confidence"
        min={50} max={100} step={1}
        value={config.conf_threshold || 80}
        valueDisplay={`${config.conf_threshold}%`}
        onChange={(e) => updateConfig({ conf_threshold: Number(e.target.value) })}
      />

      <Slider
        label="Contrast (CLAHE)"
        min={0} max={6.0} step={0.1}
        value={config.clahe_limit || 2.0}
        valueDisplay={config.clahe_limit}
        onChange={(e) => updateConfig({ clahe_limit: Number(e.target.value) })}
      />

      <Slider
        label="Scan Step (Frames)"
        min={1} max={10} step={1}
        value={config.step || 2}
        valueDisplay={config.step}
        onChange={(e) => updateConfig({ step: Number(e.target.value) })}
      />

      <div className="space-y-1 pt-2">
        <Switch
          label="Smart Skip (Static Scenes)"
          checked={config.smart_skip ?? true}
          onChange={(val) => updateConfig({ smart_skip: val })}
        />
          <Switch
          label="Upscale (2x Resolution)"
          checked={(config.scale_factor || 1) > 1.5}
          onChange={(val) => updateConfig({ scale_factor: val ? 2.0 : 1.0 })}
        />
          <Switch
          label="AI Correction (LLM)"
          checked={config.use_llm ?? false}
          onChange={(val) => updateConfig({ use_llm: val })}
        />
      </div>
    </div>
  );
};
