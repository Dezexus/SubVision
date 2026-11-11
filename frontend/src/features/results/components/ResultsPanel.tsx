import React from 'react';
import { Upload, FileVideo, Undo, Redo, Scissors, Download, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { GlassPanel, Button } from '../../../shared/ui';
import { SubtitleList } from '../../subtitles';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { useLayoutStore } from '../../../store/layoutStore';
import { useExportSrt } from '../mutations/useExportSrt';
import { useImportSrt } from '../mutations/useImportSrt';
import { API_BASE } from '../../../shared/api';
import { useTranslation } from '../../../i18n';
import { cn, countTracks, exportStem, exportWithSuffix, trackColor, trackOf } from '../../../shared/lib';
import { useTrackLabel } from '../../../hooks/useTrackLabel';

const iconButton = 'p-1.5 rounded-md text-txt-muted hover:text-txt-main hover:bg-bg-hover disabled:opacity-30 transition-all';

export const ResultsPanel = () => {
  const { t } = useTranslation();
  const metadata = useVideoStore((s) => s.metadata);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const pastSubtitles = useProcessingStore((s) => s.pastSubtitles);
  const futureSubtitles = useProcessingStore((s) => s.futureSubtitles);
  const undo = useProcessingStore((s) => s.undo);
  const redo = useProcessingStore((s) => s.redo);
  const renderedVideoUrl = useProcessingStore((s) => s.renderedVideoUrl);
  const isCollapsed = useLayoutStore((s) => s.rightCollapsed);
  const toggleCollapsed = useLayoutStore((s) => s.toggleCollapsed);

  const label = useTrackLabel();
  const regionCount = useVideoStore((s) => s.rois.length);
  const activeTrack = useVideoStore((s) => s.activeTrack);

  const { execute: exportSrt } = useExportSrt();
  const { execute: importSrt } = useImportSrt();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const exportMenuRef = React.useRef<HTMLDivElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = React.useState(false);

  const trackCount = countTracks(regionCount, subtitles);
  const currentTrack = Math.min(activeTrack, trackCount - 1);
  const tracksWithCues = [...new Set(subtitles.map(trackOf))].sort((a, b) => a - b);
  const multiTrackExport = tracksWithCues.length > 1;

  React.useEffect(() => {
    if (!exportMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

  const handleExport = (only?: number) => {
    setExportMenuOpen(false);
    exportSrt(only);
  };

  const exportDisabled = isProcessing || !metadata || subtitles.length === 0;

  const handleImportSrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importSrt(file);
    e.target.value = '';
  };

  const handleDownloadVideo = () => {
    if (!renderedVideoUrl || !metadata) return;
    const downloadLink = renderedVideoUrl.startsWith('http')
      ? renderedVideoUrl
      : `${API_BASE}${renderedVideoUrl}`;
    const link = document.createElement('a');
    link.href = downloadLink;
    const stem = exportStem(metadata.original_filename, metadata.filename);
    const ext = metadata.filename.match(/\.[^.]+$/)?.[0] || '.mp4';
    link.download = exportWithSuffix(stem, `_blurred${ext}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isCollapsed) {
    return (
      <GlassPanel className="flex flex-col items-center h-full min-h-0 bg-bg-main py-3 gap-3">
        <button
          onClick={() => toggleCollapsed('right')}
          className={iconButton}
          title={t('layout.expandRight')}
          aria-label={t('layout.expandRight')}
          aria-expanded={false}
        >
          <ChevronLeft size={16} />
        </button>
        <Scissors size={16} className="text-brand-500" aria-hidden />
        <span className="text-xs font-mono text-txt-subtle">{subtitles.length}</span>
        <button
          onClick={() => handleExport()}
          disabled={exportDisabled}
          className={iconButton}
          title={t('results.exportSrt')}
          aria-label={t('results.exportSrt')}
        >
          <Download size={16} />
        </button>
        {renderedVideoUrl && (
          <button
            onClick={handleDownloadVideo}
            className="p-1.5 rounded-md text-green-400 hover:bg-green-500/10 transition-all"
            title={t('results.downloadVideo')}
            aria-label={t('results.downloadVideo')}
          >
            <FileVideo size={16} />
          </button>
        )}
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="flex flex-col h-full min-h-0 bg-bg-main">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border-main bg-bg-surface/50">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-1.5 text-txt-main">
            <Scissors size={14} className="text-brand-500" aria-hidden />
            <span className="text-xs font-bold uppercase tracking-wider">{t('results.editor')}</span>
            {subtitles.length > 0 && (
              <span className="text-[11px] font-mono text-txt-subtle ml-1">{subtitles.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1 border-l border-border-strong pl-3">
            <button onClick={undo} disabled={pastSubtitles.length === 0} className={iconButton} title={t('results.undo')} aria-label={t('results.undo')}>
              <Undo size={14} />
            </button>
            <button onClick={redo} disabled={futureSubtitles.length === 0} className={iconButton} title={t('results.redo')} aria-label={t('results.redo')}>
              <Redo size={14} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-[11px] font-semibold bg-bg-panel border border-border-strong hover:border-brand-500 hover:text-brand-400 text-txt-muted px-2.5 py-1.5 rounded-md transition-colors shadow-sm"
            title={trackCount > 1 ? t('tracks.importInto', { name: label(currentTrack) }) : undefined}
          >
            <Upload size={12} aria-hidden />
            {t('results.importSrt')}
            {trackCount > 1 && <span className={cn('w-2 h-2 rounded-full', trackColor(currentTrack).bg)} aria-hidden />}
          </button>
          <button
            onClick={() => toggleCollapsed('right')}
            className={iconButton}
            title={t('layout.collapseRight')}
            aria-label={t('layout.collapseRight')}
            aria-expanded
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <input type="file" ref={fileInputRef} onChange={handleImportSrt} accept=".srt" className="hidden" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide bg-bg-main">
        <SubtitleList />
      </div>

      <div className="p-3 border-t border-border-main bg-bg-panel shrink-0 space-y-2">
        <div ref={exportMenuRef} className="relative flex">
          <Button
            variant="primary"
            className="flex-1 h-10 text-xs font-semibold"
            disabled={exportDisabled}
            onClick={() => (multiTrackExport ? setExportMenuOpen((open) => !open) : handleExport())}
            icon={<Download size={14} />}
            aria-haspopup={multiTrackExport ? 'menu' : undefined}
            aria-expanded={multiTrackExport ? exportMenuOpen : undefined}
          >
            {t('results.exportSrt')}
            {multiTrackExport && <ChevronUp size={14} className={cn('transition-transform', !exportMenuOpen && 'rotate-180')} />}
          </Button>
          {exportMenuOpen && (
            <div role="menu" className="absolute bottom-full left-0 right-0 mb-2 z-30 bg-bg-panel border border-border-strong rounded-lg shadow-xl p-1 animate-in fade-in slide-in-from-bottom-1">
              <button
                type="button"
                role="menuitem"
                onClick={() => handleExport()}
                className="w-full text-left px-3 py-2 rounded-md text-xs font-semibold text-txt-main hover:bg-bg-hover"
              >
                {t('tracks.exportAll', { count: tracksWithCues.length })}
              </button>
              <div className="h-px bg-border-main my-1" />
              {tracksWithCues.map((track) => (
                <button
                  key={track}
                  type="button"
                  role="menuitem"
                  onClick={() => handleExport(track)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs text-txt-muted hover:text-txt-main hover:bg-bg-hover"
                >
                  <span className={cn('w-2 h-2 rounded-full shrink-0', trackColor(track).bg)} aria-hidden />
                  <span className="truncate">{label(track)}</span>
                  <span className="ml-auto font-mono text-[11px] text-txt-dim">
                    {subtitles.filter((s) => trackOf(s) === track).length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {renderedVideoUrl && (
          <Button
            variant="success"
            className="w-full h-10 text-xs font-semibold"
            onClick={handleDownloadVideo}
            icon={<FileVideo size={14} />}
          >
            {t('results.downloadVideo')}
          </Button>
        )}
      </div>
    </GlassPanel>
  );
};
