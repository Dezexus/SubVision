/**
 * A toggle switch component bound to semantic tailwind theme colors.
 */
import React from 'react';
import { cn } from '../../utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
}

export const Switch = ({ checked, onChange, label }: SwitchProps) => {
  return (
    <div
      className="flex items-center justify-between py-2.5 cursor-pointer group select-none hover:bg-bg-hover -mx-2 px-2 rounded-sm transition-colors"
      onClick={() => onChange(!checked)}
    >
      <span className={cn(
        "text-sm font-medium transition-colors",
        checked ? "text-txt-main" : "text-txt-muted"
      )}>
        {label}
      </span>

      <div className={cn(
        "w-10 h-5 rounded-full relative transition-all duration-200 border box-content",
        checked
          ? "bg-brand-500 border-brand-500"
          : "bg-bg-panel border-border-strong group-hover:border-border-hover"
      )}>
        <div className={cn(
          "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ease-out",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )} />
      </div>
    </div>
  );
};
