import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';

interface Props {
  open: boolean;
  title: string;
  description: string;
  note?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}

/**
 * Modal confirmation for destructive actions. Focus starts on Cancel, Escape
 * and a click outside cancel.
 */
export const ConfirmDialog = ({
  open, title, description, note, confirmLabel, cancelLabel, onConfirm, onCancel, busy,
}: Props) => {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="w-full max-w-md mx-4 rounded-xl bg-bg-panel border border-border-strong shadow-panel p-6 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="shrink-0 w-10 h-10 rounded-full bg-red-500/15 text-red-400 flex items-center justify-center">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-2">
            <h2 id={titleId} className="text-base font-semibold text-txt-main">{title}</h2>
            <p id={descId} className="text-sm text-txt-muted leading-relaxed">{description}</p>
            {note && <p className="text-sm text-amber-400">{note}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} isLoading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
