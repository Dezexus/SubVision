/**
 * A reusable, styled button component with multiple variants and loading states using semantic theme colors.
 */
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

  const variants = {
    primary: "bg-brand-500 hover:bg-brand-hover text-white shadow-sm",
    success: "bg-green-600 hover:bg-green-700 text-white shadow-sm",
    danger: "bg-red-500 hover:bg-red-600 text-white shadow-sm",
    secondary: "bg-bg-input hover:bg-bg-input-hover text-white border border-border-strong",
    ghost: "bg-transparent hover:bg-bg-hover text-txt-muted hover:text-white",
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        "flex items-center justify-center gap-2 px-4 py-2.5 rounded-sm text-sm font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-offset-bg-main focus:ring-brand-500",
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
