// A component for selecting a predefined set of OCR processing settings.
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
    // Directly set the active preset ID and apply its configuration
    // @ts-ignore - Direct state mutation for simplicity here
    useAppStore.setState({ preset: p.id });
    updateConfig(p.config);
  };

  return (
    <div className="space-y-3">
      <label className="text-[11px] font-bold uppercase tracking-wider text-[#C5C5C5] mb-2 block">
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
                  ? "bg-[#04395e] border-[#007acc] ring-1 ring-[#007acc] shadow-sm z-10" // Active state styles
                  : "bg-[#252526] border-[#3c3c3c] hover:bg-[#2a2d2e] hover:border-[#007acc]/50" // Inactive state styles
              )}
            >
              {/* Icon */}
              <div className={cn(
                "p-2 rounded-sm transition-colors",
                isActive ? "bg-[#007acc] text-white" : "bg-[#3c3c3c] text-[#F0F0F0] group-hover:bg-[#454545]"
              )}>
                {p.icon}
              </div>

              {/* Text Content */}
              <div className="flex-1 min-w-0">
                <div className={cn("font-semibold text-sm", isActive ? "text-white" : "text-[#F0F0F0]")}>
                  {p.label}
                </div>
                <div className={cn("text-xs truncate mt-0.5", isActive ? "text-[#e1e1e1]" : "text-[#C5C5C5]")}>
                  {p.desc}
                </div>
              </div>

              {/* Active Indicator Checkmark */}
              {isActive && (
                <div className="bg-[#007acc] text-white rounded-full p-1 shadow-sm absolute -right-2 -top-2 border-2 border-[#1e1e1e]">
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
