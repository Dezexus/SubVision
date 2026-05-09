import React from 'react';
import { useConfigStore } from '../../../store/configStore';

const PRESETS = [
  {
    id: '🎯 Quality',
    label: 'Качество (Quality)',
    desc: 'Покадровая точность (шаг 1, 85%+). Идеально для финального рендера.',
  },
  {
    id: '⚖️ Balance',
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
              className={`flex flex-col items-start p-3 rounded-lg border transition-all duration-200 ${
                isActive
                  ? 'border-brand-500 bg-brand-500/10'
                  : 'border-border-main bg-bg-panel hover:border-border-strong'
              }`}
            >
              <span className={`text-sm font-bold ${isActive ? 'text-brand-400' : 'text-txt-main'}`}>{preset.label}</span>
              <span className="text-xs text-txt-subtle mt-1 text-left">{preset.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};