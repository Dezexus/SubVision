/**
 * A component for selecting a predefined set of OCR processing settings mapped to the unified theme.
 */
import React from 'react';
import { Zap, Shield, Eye, Check } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';

const PRESETS = [
  {
    id: '⚖️ Balance',
    icon: <Shield size={18} />,
    label: 'Balanced',
    desc: 'Movies & TV Shows',
    config: { step: 2, conf_threshold: 80, clahe_limit: 2.0, scale_factor: 2.0, smart_skip: true }
  },
  {
    id: '🏎️ Speed',
    icon: <Zap size={18} />,
    label: 'High Speed',
    desc: 'Draft / Clean video',
    config: { step: 4, conf_threshold: 70, clahe_limit: 1.0, scale_factor: 1.5, smart_skip: true }
  },
  {
    id: '🎯 Quality',
    icon: <Eye size={18} />,
    label: 'High Quality',
    desc: 'Frame-perfect timing',
    config: { step: 1, conf_threshold: 85, clahe_limit: 2.5, scale_factor: 2.5, smart_skip: false }
  }
];

export const PresetSelector = () => {
  const { preset, updateConfig } = useAppStore();

  const handleSelect = (p: typeof PRESETS[0]) => {
    useAppStore.setState({ preset: p.id } as any);
    updateConfig(p.config);
  };

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-bold uppercase tracking-wider text-txt-muted mb-2 block">
        Processing Mode
      </label>
      <div className="grid grid-cols-1 gap-2">
        {PRESETS.map((p) => {
          const isActive = preset === p.id;
          return (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className={cn(
                "relative p-3 rounded-sm border text-left flex items-center gap-3 transition-all duration-200 group",
                isActive
                  ? "bg-brand-active border-brand-500 ring-1 ring-brand-500 shadow-sm z-10"
                  : "bg-bg-panel border-bg-input hover:bg-bg-hover hover:border-brand-500/50"
              )}
            >
              <div className={cn(
                "p-2 rounded-sm transition-colors",
                isActive ? "bg-brand-500 text-white" : "bg-bg-input text-txt-main group-hover:bg-border-strong"
              )}>
                {p.icon}
              </div>

              <div className="flex-1 min-w-0">
                <div className={cn("font-semibold text-sm", isActive ? "text-white" : "text-txt-main")}>
                  {p.label}
                </div>
                <div className={cn("text-xs truncate mt-0.5", isActive ? "text-white/80" : "text-txt-muted")}>
                  {p.desc}
                </div>
              </div>

              {isActive && (
                <div className="bg-brand-500 text-white rounded-full p-1 shadow-sm absolute -right-2 -top-2 border-2 border-bg-main">
                   <Check size={10} strokeWidth={4} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
