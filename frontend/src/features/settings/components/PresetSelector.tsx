/**
 * Component for selecting video processing presets dynamically fetched from backend.
 */
import React, { useEffect } from 'react';
import { Zap, Shield, Eye, Settings } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { api } from '../../../services/api';
import type { Preset } from '../../../types';

export const PresetSelector = () => {
  const { preset, setPreset, updateConfig, availablePresets, setAvailablePresets } = useAppStore();

  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const data = await api.getPresets();
        setAvailablePresets(data);
      } catch (error) {
        console.error(error);
      }
    };

    if (availablePresets.length === 0) {
      fetchPresets();
    }
  }, [availablePresets.length, setAvailablePresets]);

  const handleSelect = (p: Preset) => {
    setPreset(p.id);
    updateConfig({
      step: p.config.step,
      conf_threshold: p.config.min_conf,
      scale_factor: p.config.scale_factor,
      smart_skip: p.config.smart_skip
    });
  };

  const getIcon = (id: string) => {
    if (id.includes('Balance')) return <Shield size={18} />;
    if (id.includes('Speed')) return <Zap size={18} />;
    if (id.includes('Quality')) return <Eye size={18} />;
    return <Settings size={18} />;
  };

  return (
    <div className="space-y-2">
      <label className="text-[11px] font-bold uppercase tracking-wider text-txt-subtle mb-1 block">
        Processing Mode
      </label>
      <div className="grid grid-cols-3 gap-2">
        {availablePresets.map((p) => {
          const isActive = preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              title={p.desc}
              className={cn(
                "flex flex-col items-center justify-center p-3 rounded-md border transition-all duration-150 gap-2 focus:outline-none focus:ring-1 focus:ring-brand-500",
                isActive
                  ? "bg-brand-500/10 border-brand-500 text-brand-400 z-10 shadow-sm"
                  : "bg-bg-panel border-border-strong text-txt-muted hover:bg-bg-hover hover:border-border-hover hover:text-txt-main"
              )}
            >
              <div className={cn(
                "transition-transform duration-200",
                isActive ? "scale-110" : "scale-100"
              )}>
                {getIcon(p.id)}
              </div>
              <span className={cn(
                  "text-[11px] font-semibold tracking-wide uppercase",
                  isActive ? "text-brand-400" : "text-txt-main"
              )}>
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
