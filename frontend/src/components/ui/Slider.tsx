import React, { useEffect, useState } from 'react';
import { cn } from '../../utils/cn';

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  valueDisplay?: string | number; // Legacy prop (kept for compatibility)
  suffix?: string; // e.g. "px", "%"
}

export const Slider = ({ label, valueDisplay, suffix, className, ...props }: SliderProps) => {
  const min = Number(props.min) || 0;
  const max = Number(props.max) || 100;
  const val = Number(props.value) || 0;
  const percentage = Math.min(Math.max(((val - min) / (max - min)) * 100, 0), 100);

  // If valueDisplay is provided, use it (read-only mode for compatibility).
  // Otherwise, allow manual input if 'suffix' or standard props are used.
  const isEditable = valueDisplay === undefined;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (props.onChange) {
      // Pass the event up to the parent handler
      props.onChange(e);
    }
  };

  return (
    <div className={cn("w-full space-y-3 font-sans", className)}>

      <div className="flex justify-between items-end">
        {label ? (
          <label className="text-xs font-bold uppercase tracking-wide text-[#C5C5C5] select-none mb-1">
            {label}
          </label>
        ) : <span />}

        {isEditable ? (
           <div className="flex items-center bg-[#3c3c3c] border border-[#454545] rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-[#007acc] shadow-sm h-7">
              <input
                  type="number"
                  value={props.value}
                  onChange={handleInputChange}
                  className="w-14 bg-transparent text-white text-sm font-mono font-bold text-center focus:outline-none p-1 h-full appearance-none"
                  min={props.min}
                  max={props.max}
                  step={props.step}
              />
              {suffix && (
                  <span className="text-[10px] text-[#9E9E9E] font-bold bg-[#333333] h-full px-1.5 flex items-center justify-center border-l border-[#454545] select-none">
                      {suffix}
                  </span>
              )}
           </div>
        ) : (
            valueDisplay && (
                <div className="font-mono text-sm font-bold text-white bg-[#3c3c3c] border border-[#454545] px-3 py-1 rounded-md min-w-[4rem] text-center select-all shadow-sm">
                    {valueDisplay}
                </div>
            )
        )}
      </div>

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
