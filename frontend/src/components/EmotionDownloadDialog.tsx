import React from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '../shared/ui';
import { useTranslation } from '../i18n';
import { useEmotionExportStore } from '../store/emotionExportStore';
import { downloadFile } from '../shared/lib/download';

export const EmotionDownloadDialog: React.FC = () => {
  const { t } = useTranslation();
  const pending = useEmotionExportStore((s) => s.pendingDownload);
  const clearPendingDownload = useEmotionExportStore((s) => s.clearPendingDownload);

  if (!pending) return null;

  const handleDownload = () => {
    downloadFile(pending.url, pending.filename);
    clearPendingDownload();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-bg-panel border border-border-main rounded-xl shadow-panel overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-main">
          <h2 className="text-sm font-bold flex items-center gap-2">
            <Download size={16} className="text-brand-400" />
            {t('emotion.downloadReadyTitle')}
          </h2>
          <button type="button" onClick={clearPendingDownload} className="text-txt-muted hover:text-txt-main">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-4 space-y-2">
          <p className="text-sm text-txt-muted">{t('emotion.downloadReadyHint')}</p>
          <p className="text-xs font-mono text-txt-subtle truncate">{pending.filename}</p>
        </div>
        <div className="p-4 border-t border-border-main flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={clearPendingDownload}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" className="flex-1" icon={<Download size={14} />} onClick={handleDownload}>
            {t('emotion.downloadBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
};
