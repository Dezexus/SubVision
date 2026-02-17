// A reusable, styled button component with multiple variants and loading states.
import React from 'react';
import { cn } from '../../utils/cn';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button = ({
  children,
  className,
  variant = 'primary',
  isLoading,
  icon,
  disabled,
  ...props
}: ButtonProps) => {

  // Style variants mapping
  const variants = {
    // VS Code Blue (Primary Action)
    primary: "bg-[#007acc] hover:bg-[#005fb8] text-white shadow-sm",
    // Green (Start / Confirm)
    success: "bg-[#16a34a] hover:bg-[#15803d] text-white shadow-sm",
    // Red (Destructive / Stop)
    danger: "bg-[#ef4444] hover:bg-[#dc2626] text-white shadow-sm",
    // Gray (Secondary) - VS Code Style
    secondary: "bg-[#3c3c3c] hover:bg-[#4b4b4b] text-white border border-[#454545]",
    // Ghost (Transparent)
    ghost: "bg-transparent hover:bg-[#2a2d2e] text-[#cccccc] hover:text-white",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-[#1e1e1e] focus:ring-[#007acc]",
        variants[variant],
        (disabled || isLoading) && "opacity-50 cursor-not-allowed contrast-50",
        className
      )}
      {...props}
    >
      {isLoading ? <Loader2 className="animate-spin" size={16} /> : icon}
      {children}
    </button>
  );
};
