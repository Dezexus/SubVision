// A styled container component with a dark, panel-like theme.
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
        "rounded-xl",
        "bg-[#252526]",
        "border border-[#333333]",
        "shadow-panel",
        "text-txt-main",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
