/**
 * A styled container component utilizing semantic background and border colors.
 */
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
