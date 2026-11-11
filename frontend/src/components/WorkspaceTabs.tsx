import { ScanText, PenLine, Eraser } from 'lucide-react';
import { useProcessingStore } from '../store/processingStore';
import { setWorkspaceMode, useWorkspaceMode, type WorkspaceMode } from '../store/workspace';
import { cn } from '../shared/lib';
import { useTranslation } from '../i18n';

const MODES: { mode: WorkspaceMode; icon: typeof ScanText; labelKey: string }[] = [
  { mode: 'ocr', icon: ScanText, labelKey: 'modes.ocr' },
  { mode: 'edit', icon: PenLine, labelKey: 'modes.edit' },
  { mode: 'blur', icon: Eraser, labelKey: 'modes.blur' },
];

/** Stage switcher: Recognition → Editing → Subtitle removal. */
export const WorkspaceTabs = () => {
  const { t } = useTranslation();
  const current = useWorkspaceMode();
  const hasSubtitles = useProcessingStore((s) => s.subtitles.length > 0);
  const isProcessing = useProcessingStore((s) => s.isProcessing);

  const blockedReason = (mode: WorkspaceMode): string | null => {
    if (mode === current) return null;
    if (isProcessing) return t('modes.busy');
    if (mode !== 'ocr' && !hasSubtitles) return t('modes.needSubtitles');
    return null;
  };

  return (
    <div role="tablist" aria-label={t('modes.label')} className="flex items-center gap-1 bg-bg-panel border border-border-main rounded-lg p-1 shadow-sm">
      {MODES.map(({ mode, icon: Icon, labelKey }, i) => {
        const reason = blockedReason(mode);
        const selected = mode === current;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={!!reason}
            title={reason ?? undefined}
            onClick={() => !reason && setWorkspaceMode(mode)}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
              selected ? 'bg-brand-500 text-white shadow-sm' : 'text-txt-muted hover:text-txt-main hover:bg-bg-hover',
              reason && 'opacity-40 cursor-not-allowed hover:bg-transparent hover:text-txt-muted',
            )}
          >
            <span className={cn('text-[11px] font-mono', selected ? 'text-white/70' : 'text-txt-dim')}>{i + 1}</span>
            <Icon size={14} aria-hidden />
            {t(labelKey)}
          </button>
        );
      })}
    </div>
  );
};
