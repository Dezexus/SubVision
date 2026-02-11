import React from 'react';
import { cn } from '../../utils/cn';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const GlassPanel = ({ children, className, ...props }: GlassPanelProps) => {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden",
        "rounded-xl", // Более плавные углы
        "bg-[#252526]", // Solid panel background
        "border border-[#333333]", // Subtle border
        "shadow-panel", // Deep shadow helps separation without harsh lines
        "text-txt-main",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
