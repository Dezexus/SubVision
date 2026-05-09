import React from 'react';
import { useConfigStore } from '../../../store/configStore';
import { Gem, Gauge } from 'lucide-react';

const PRESETS = [
  {
    id: '🎯 Quality',
    icon: <Gem size={20} />,
    label: 'Качество (Quality)',
    desc: 'Покадровая точность (шаг 1, 85%+). Идеально для финального рендера.',
  },
  {
    id: '⚖️ Balance',
    icon: <Gauge size={20} />,
    label: 'Баланс (Balance)',
    desc: 'Умный поиск (шаг 5 кадров). Работает быстро, уточняет границы автоматически.',
  },
];

export const PresetSelector: React.FC = () => {
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-bold text-txt-subtle uppercase tracking-wider">Режим обработки</h3>
      <div className="grid grid-cols-1 gap-3">
        {PRESETS.map((preset) => {
          const isActive = config.preset === preset.id;
          return (
            <button
              key={preset.id}
              onClick={() => setConfig({ preset: preset.id })}
              className={`relative flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200 text-left overflow-hidden group ${
                isActive
                  ? 'border-brand-500 bg-brand-500/10 shadow-[0_0_15px_rgba(0,122,204,0.1)] scale-[1.02]'
                  : 'border-border-main bg-bg-panel hover:border-border-strong hover:bg-bg-hover'
              }`}
            >
              <div className={`mt-0.5 transition-colors ${isActive ? 'text-brand-400' : 'text-txt-dim group-hover:text-txt-subtle'}`}>
                {preset.icon}
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