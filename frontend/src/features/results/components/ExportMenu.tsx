import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Sparkles, Upload } from 'lucide-react';
import { cn } from '../../../shared/lib';
import { useTranslation } from '../../../i18n';

interface Props {
  disabled?: boolean;
  onExportSrt: () => void;
  onExportEmotion: () => void;
  onImportEmotionJson?: (file: File) => void;
}

export const ExportMenu: React.FC<Props> = ({
  disabled,
  onExportSrt,
  onExportEmotion,
  onImportEmotionJson,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative flex-1" ref={ref}>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && onImportEmotionJson) onImportEmotionJson(file);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'w-full h-10 flex items-center justify-center gap-2 rounded-md text-xs font-semibold',
          'bg-brand-500 hover:bg-brand-400 text-white shadow-md transition-colors',
          'disabled:opacity-40 disabled:cursor-not-allowed',
        )}
      >
        <Download size={14} />
        {t('results.export')}
        <ChevronDown size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-bg-panel border border-border-main rounded-lg shadow-panel overflow-hidden z-30">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-bg-hover text-left"
            onClick={() => { onExportSrt(); setOpen(false); }}
          >
            <Download size={14} className="text-brand-400" />
            {t('results.exportSrt')}
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-bg-hover text-left border-t border-border-main"
            onClick={() => { onExportEmotion(); setOpen(false); }}
          >
            <Sparkles size={14} className="text-emerald-400" />
            {t('results.exportEmotion')}
          </button>
          {onImportEmotionJson && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs hover:bg-bg-hover text-left border-t border-border-main"
              onClick={() => { fileRef.current?.click(); setOpen(false); }}
            >
              <Upload size={14} className="text-amber-400" />
              {t('results.importEmotionJson')}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
