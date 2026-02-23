/**
 * Advanced settings component including OCR threshold, frame stepping, and language selection dynamically loaded.
 */
import React, { useEffect } from 'react';
import { Globe } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { Slider } from '../../../components/ui/Slider';
import { Switch } from '../../../components/ui/Switch';
import { api } from '../../../services/api';

export const AdvancedSettings = () => {
  const { config, updateConfig, availableLanguages, setAvailableLanguages, defaultConfig } = useAppStore();

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const data = await api.getLanguages();
        setAvailableLanguages(data);
      } catch (error) {
        console.error(error);
      }
    };

    if (availableLanguages.length === 0) {
      fetchLanguages();
    }
  }, [availableLanguages.length, setAvailableLanguages]);

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex justify-between items-end mb-1">
          <label className="text-xs font-bold uppercase tracking-wide text-txt-muted select-none flex items-center gap-1.5">
            <Globe size={12} /> OCR Language
          </label>
        </div>
        <div className="relative">
          <select
            value={config.languages || defaultConfig?.languages || 'en'}
            onChange={(e) => updateConfig({ languages: e.target.value })}
            className="w-full bg-bg-input border border-border-strong rounded-md text-sm text-txt-main px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 appearance-none cursor-pointer font-medium"
          >
            {availableLanguages.length === 0 ? (
                <option value="en">English</option>
            ) : (
                availableLanguages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.name}
                    </option>
                ))
            )}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-txt-subtle">
            <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" fillRule="evenodd"></path>
            </svg>
          </div>
        </div>
      </div>

      <Slider
        label="Min Confidence"
        min={50} max={100} step={1}
        value={config.conf_threshold ?? defaultConfig?.conf_threshold ?? 0}
        valueDisplay={`${config.conf_threshold ?? defaultConfig?.conf_threshold ?? 0}%`}
        onChange={(e) => updateConfig({ conf_threshold: Number(e.target.value) })}
      />

      <Slider
        label="Scan Step (Frames)"
        min={1} max={10} step={1}
        value={config.step ?? defaultConfig?.step ?? 0}
        valueDisplay={config.step ?? defaultConfig?.step ?? 0}
        onChange={(e) => updateConfig({ step: Number(e.target.value) })}
      />

      <div className="space-y-1 pt-2 border-t border-border-main">
        <Switch
          label="Smart Skip (Static Scenes)"
          checked={config.smart_skip ?? defaultConfig?.smart_skip ?? false}
          onChange={(val) => updateConfig({ smart_skip: val })}
        />
        <Switch
          label="Upscale (2x Resolution)"
          checked={(config.scale_factor ?? defaultConfig?.scale_factor ?? 1.0) > 1.5}
          onChange={(val) => updateConfig({ scale_factor: val ? 2.0 : 1.0 })}
        />
      </div>
    </div>
  );
};
