import { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { useVideoStore } from '../store/videoStore';
import { useProcessingStore } from '../store/processingStore';
import { ConfirmDialog } from '../shared/ui';
import { useTranslation } from '../i18n';

/** Deletes the video on the server and resets the project, after a confirmation dialog. */
export const NewProjectButton = () => {
  const { t } = useTranslation();
  const resetProject = useVideoStore((s) => s.resetProject);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await resetProject();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold text-txt-muted bg-bg-panel border border-border-main hover:text-red-300 hover:border-red-500/40 transition-colors"
      >
        <FilePlus2 size={14} aria-hidden />
        {t('project.new')}
      </button>
      <ConfirmDialog
        open={open}
        title={t('project.confirmTitle')}
        description={t('project.confirmText')}
        note={isProcessing ? t('project.busyNote') : undefined}
        confirmLabel={t('project.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        busy={busy}
      />
    </>
  );
};
