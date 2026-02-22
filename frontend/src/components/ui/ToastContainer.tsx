/**
 * Container and individual toast components for global notifications.
 */
import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { cn } from '../../utils/cn';
import type { ToastMessage } from '../../types';

const Toast = ({ toast }: { toast: ToastMessage }) => {
  const removeToast = useAppStore((state) => state.removeToast);

  useEffect(() => {
    const timer = setTimeout(() => removeToast(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  const icons = {
    success: <CheckCircle className="text-green-400" size={18} />,
    error: <AlertCircle className="text-red-400" size={18} />,
    info: <Info className="text-brand-400" size={18} />
  };

  return (
    <div className={cn(
      "flex items-start gap-3 p-4 rounded-lg border shadow-lg bg-bg-panel min-w-[300px] max-w-md animate-in slide-in-from-right-full fade-in duration-300",
      toast.type === 'error' ? 'border-red-500/30' :
      toast.type === 'success' ? 'border-green-500/30' : 'border-brand-500/30'
    )}>
      <div className="flex-shrink-0 mt-0.5">
        {icons[toast.type]}
      </div>
      <div className="flex-1 text-sm text-txt-main">
        {toast.message}
      </div>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 text-txt-muted hover:text-white transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export const ToastContainer = () => {
  const toasts = useAppStore((state) => state.toasts);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast toast={toast} />
        </div>
      ))}
    </div>
  );
};
