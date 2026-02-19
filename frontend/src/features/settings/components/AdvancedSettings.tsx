/**
 * Advanced settings component including OCR threshold, frame stepping, and language selection.
 */
import React from 'react';
import { Settings2, Globe } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { Slider } from '../../../components/ui/Slider';
import { Switch } from '../../../components/ui/Switch';

export const AdvancedSettings = () => {
  const { config, updateConfig } = useAppStore();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#C5C5C5] mb-2">
        <Settings2 size={14} />
        <span>Fine Tuning</span>
      </div>

      <div className="space-y-3">
        <div className="flex justify-between items-end mb-1">
          <label className="text-xs font-bold uppercase tracking-wide text-[#C5C5C5] select-none flex items-center gap-1.5">
            <Globe size={12} /> OCR Language
          </label>
        </div>
        <div className="relative">
          <select
            value={config.languages || 'en'}
            onChange={(e) => updateConfig({ languages: e.target.value })}
            className="w-full bg-[#3c3c3c] border border-[#454545] rounded-md text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#007acc] appearance-none cursor-pointer font-medium"
          >
            <option value="en">English (en)</option>
            <option value="ru">Russian (ru)</option>
            <option value="ch">Chinese (ch)</option>
            <option value="fr">French (fr)</option>
            <option value="german">German (german)</option>
            <option value="korean">Korean (korean)</option>
            <option value="japan">Japanese (japan)</option>
            <option value="es">Spanish (es)</option>
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-[#858585]">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
            </svg>
          </div>
        </div>
      </div>

      <Slider
        label="Min Confidence"
        min={50} max={100} step={1}
        value={config.conf_threshold || 80}
        valueDisplay={`${config.conf_threshold}%`}
        onChange={(e) => updateConfig({ conf_threshold: Number(e.target.value) })}
      />

      <Slider
        label="Scan Step (Frames)"
        min={1} max={10} step={1}
        value={config.step || 2}
        valueDisplay={config.step}
        onChange={(e) => updateConfig({ step: Number(e.target.value) })}
      />

      <div className="space-y-1 pt-2 border-t border-[#333333]">
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
      </div>
    </div>
  );
};
