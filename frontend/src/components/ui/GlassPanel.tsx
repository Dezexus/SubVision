import React from 'react';
import { cn } from '../../shared/lib';

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

/**
 * Layout container applying a glassmorphism style effect.
 */
export const GlassPanel = ({ children, className, ...props }: GlassPanelProps) => {
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden",
        "rounded-xl",
        "bg-bg-panel",
        "border border-border-main",
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