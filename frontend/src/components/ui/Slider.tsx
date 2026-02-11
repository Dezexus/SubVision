import React from 'react';
import { cn } from '../../utils/cn';

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  valueDisplay?: string | number;
}

export const Slider = ({ label, valueDisplay, className, ...props }: SliderProps) => {
  const min = Number(props.min) || 0;
  const max = Number(props.max) || 100;
  const val = Number(props.value) || 0;
  const percentage = Math.min(Math.max(((val - min) / (max - min)) * 100, 0), 100);

  // Проверяем, есть ли что показывать в заголовке
  const hasValue = valueDisplay !== undefined && valueDisplay !== null;
  const showHeader = label || hasValue;

  return (
    <div className={cn("w-full space-y-3 font-sans", className)}>

      {/* Рендерим заголовок ТОЛЬКО если есть контент */}
      {showHeader && (
        <div className="flex justify-between items-end">
          {label ? (
            <label className="text-xs font-bold uppercase tracking-wide text-[#C5C5C5] select-none mb-1">
              {label}
            </label>
          ) : <span />} {/* Пустой спан для сохранения flex-разметки, если есть value но нет label */}

          {hasValue && (
            <div className="font-mono text-sm font-bold text-white bg-[#3c3c3c] border border-[#454545] px-3 py-1 rounded-md min-w-[4rem] text-center select-all shadow-sm">
              {valueDisplay}
            </div>
          )}
        </div>
      )}

      <div className="relative h-8 flex items-center group">
        <input
          type="range"
          className="w-full absolute z-20 opacity-0 cursor-pointer h-full appearance-none bg-transparent"
          {...props}
        />

        {/* Track */}
        <div className="w-full h-3 bg-[#18181b] rounded-full overflow-hidden border border-[#333333] relative z-10 pointer-events-none shadow-inner">
          <div 
            className="h-full bg-[#007acc] transition-all duration-75 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Thumb */}
        <div 
          className="absolute h-5 w-5 bg-[#F0F0F0] border-2 border-[#1e1e1e] rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.3)] z-10 pointer-events-none transition-transform duration-75 ease-out group-hover:scale-110 group-active:scale-95"
          style={{ left: `calc(${percentage}% - 10px)` }} 
        />
      </div>
    </div>
  );
};
