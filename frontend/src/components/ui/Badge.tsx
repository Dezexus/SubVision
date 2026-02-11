import React from 'react';
import { cn } from '../../utils/cn';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'ai';
  className?: string;
}

export const Badge = ({ children, variant = 'neutral', className }: BadgeProps) => {
  const variants = {
    success: "bg-green-500/10 text-green-400 border-green-500/20",
    warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    danger: "bg-red-500/10 text-red-400 border-red-500/20",
    neutral: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    ai: "bg-purple-500/10 text-purple-300 border-purple-500/20 animate-pulse-slow", // Для AI исправлений
  };

  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-[10px] font-mono border uppercase tracking-wide",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
};
