/**
 * Component for selecting video processing presets.
 */
import React from 'react';
import { Zap, Shield, Eye } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';

const PRESETS = [
  {
    id: '⚖️ Balance',
    icon: <Shield size={18} />,
    label: 'Balanced',
    desc: 'Movies & TV Shows',
    config: { step: 2, conf_threshold: 80, scale_factor: 2.0, smart_skip: true }
  },
  {
    id: '🏎️ Speed',
    icon: <Zap size={18} />,
    label: 'Speed',
    desc: 'Draft / Clean video',
    config: { step: 4, conf_threshold: 70, scale_factor: 1.5, smart_skip: true }
  },
  {
    id: '🎯 Quality',
    icon: <Eye size={18} />,
    label: 'Quality',
    desc: 'Frame-perfect timing',
    config: { step: 1, conf_threshold: 85, scale_factor: 2.5, smart_skip: false }
  }
];

export const PresetSelector = () => {
  const { preset, setPreset, updateConfig } = useAppStore();

  const handleSelect = (p: typeof PRESETS[0]) => {
    setPreset(p.id);
    updateConfig(p.config);
  };

  return (
    <div className="space-y-2">
      <label className="text-[11px] font-bold uppercase tracking-wider text-txt-subtle mb-1 block">
        Processing Mode
      </label>
      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map((p) => {
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
                {p.icon}
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
