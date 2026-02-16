// A toggle switch component with a label and custom styling.
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
      className="flex items-center justify-between py-2.5 cursor-pointer group select-none hover:bg-[#2a2d2e] -mx-2 px-2 rounded-sm transition-colors"
      onClick={() => onChange(!checked)}
    >
      <span className={cn(
        "text-sm font-medium transition-colors",
        checked ? "text-white" : "text-[#C5C5C5]" // Label color changes with state
      )}>
        {label}
      </span>

      <div className={cn(
        "w-10 h-5 rounded-full relative transition-all duration-200 border box-content",
        checked
          ? "bg-[#007acc] border-[#007acc]" // Checked state
          : "bg-[#252526] border-[#454545] group-hover:border-[#6b6b6b]" // Unchecked state
      )}>
        <div className={cn(
          "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform duration-200 ease-out",
          checked ? "translate-x-[22px]" : "translate-x-0.5" // Thumb position
        )} />
      </div>
    </div>
  );
};
