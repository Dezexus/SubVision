/**
 * A minimalist, highly optimized slider component designed for dense control panels.
 * Features a slim track, clean typography, and deferred global state commits.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '../../utils/cn';

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  valueDisplay?: string | number;
  suffix?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Slider = ({ label, valueDisplay, suffix, className, onChange, ...props }: SliderProps) => {
  const { min: rawMin, max: rawMax, step, name, value, ...restProps } = props;

  const min = Number(rawMin) || 0;
  const max = Number(rawMax) || 100;

  const [localValue, setLocalValue] = useState<number>(Number(value) || 0);

  useEffect(() => {
    setLocalValue(Number(value) || 0);
  }, [value]);

  const percentage = Math.min(Math.max(((localValue - min) / (max - min)) * 100, 0), 100);
  const isEditable = valueDisplay === undefined;

  const handleLocalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(Number(e.target.value));
  };

  const handleCommit = useCallback(() => {
    if (onChange && localValue !== Number(value)) {
      onChange({
        target: { value: String(localValue), name: name }
      } as React.ChangeEvent<HTMLInputElement>);
    }
  }, [localValue, value, name, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommit();
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      handleCommit();
    }
  };

  return (
    <div className={cn("w-full space-y-1.5 font-sans group/slider", className)}>
      <div className="flex justify-between items-center">
        {label ? (
          <label className="text-[11px] font-medium text-txt-muted select-none">
            {label}
          </label>
        ) : <span />}

        {isEditable ? (
           <div className="flex items-center text-[11px] font-mono">
              <input
                  type="number"
                  value={localValue}
                  onChange={handleLocalChange}
                  onBlur={handleCommit}
                  onKeyDown={handleKeyDown}
                  className="w-10 bg-transparent text-txt-main text-right focus:text-brand-400 focus:bg-bg-hover rounded px-1 transition-colors outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  min={min}
                  max={max}
                  step={step}
              />
              {suffix && (
                  <span className="text-txt-subtle ml-0.5 select-none">
                      {suffix}
                  </span>
              )}
           </div>
        ) : (
            valueDisplay && (
                <div className="text-[11px] font-mono text-txt-main pr-1">
                    {valueDisplay}
                </div>
            )
        )}
      </div>

      <div className="relative h-4 flex items-center group/track cursor-pointer">
        <input
          type="range"
          className="w-full absolute z-20 opacity-0 cursor-pointer h-full m-0"
          value={localValue}
          onChange={handleLocalChange}
          onMouseUp={handleCommit}
          onTouchEnd={handleCommit}
          onKeyUp={handleKeyUp}
          min={min}
          max={max}
          step={step}
          name={name}
          {...restProps}
        />

        <div className="w-full h-1 bg-border-main rounded-full overflow-hidden relative z-10 pointer-events-none transition-colors group-hover/track:bg-border-strong">
          <div
            className="h-full bg-brand-500 transition-all duration-75 ease-out"
            style={{ width: `${percentage}%` }}
          />
        </div>

        <div
          className="absolute h-2.5 w-2.5 bg-white rounded-full shadow-sm z-10 pointer-events-none transition-transform duration-75 ease-out group-hover/slider:scale-125"
          style={{ left: `calc(${percentage}% - 5px)` }}
        />
      </div>
    </div>
  );
};
