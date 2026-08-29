import React, { useState } from 'react';
import { ScanFace, ArrowLeft, Upload, FileVideo, Play, EyeOff, Undo, Redo, Scissors } from 'lucide-react';
import { GlassPanel, Button } from '../../../shared/ui';
import { SubtitleList } from '../../subtitles';
import { EmotionExportDialog } from '../../export/components/EmotionExportDialog';
import { ExportMenu } from './ExportMenu';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { useBlurStore } from '../../../store/blurStore';
import { useExportSrt } from '../mutations/useExportSrt';
import { useImportSrt } from '../mutations/useImportSrt';
import { API_BASE } from '../../../shared/api';
import { useTranslation } from '../../../i18n';
import { cn, exportStem, exportWithSuffix } from '../../../shared/lib';
import { useEmotionExportStore } from '../../../store/emotionExportStore';
import { useUIStore } from '../../../store/uiStore';
import { readEmotionJsonSpeakers } from '../../export/lib/emotionJsonImport';

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

  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const setBlurMode = useBlurStore((s) => s.setBlurMode);

  const isPreviewMode = useVideoStore((s) => s.isPreviewMode);
  const setPreviewMode = useVideoStore((s) => s.setPreviewMode);

  const { execute: exportSrt } = useExportSrt();
  const { execute: importSrt } = useImportSrt();

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [emotionOpen, setEmotionOpen] = useState(false);
  const setSpeakerProfileOverrides = useEmotionExportStore((s) => s.setSpeakerProfileOverrides);
  const addToast = useUIStore((s) => s.addToast);

  const actionsDisabled = isProcessing || !metadata || subtitles.length === 0;

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

  const handleImportEmotionJson = async (file: File) => {
    try {
      const overrides = await readEmotionJsonSpeakers(file);
      setSpeakerProfileOverrides(overrides);
      addToast(t('results.importEmotionJsonSuccess', { count: Object.keys(overrides).length }), 'success');
      setEmotionOpen(true);
    } catch (e) {
      addToast(e instanceof Error ? e.message : t('results.importEmotionJsonFailed'), 'error');
    }
  };

  return (
    <GlassPanel className="flex flex-col h-full min-h-0 bg-bg-main">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-main bg-bg-surface/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-txt-main">
            <Scissors size={14} className="text-brand-500" />
            <span className="text-xs font-bold uppercase tracking-wider">{t('results.editor')}</span>
            {subtitles.length > 0 && (
              <span className="text-[10px] font-mono text-txt-subtle ml-1">{subtitles.length}</span>
            )}
          </div>
          <div className="flex items-center gap-1 border-l border-border-strong pl-3">
            <button
              onClick={undo}
              disabled={pastSubtitles.length === 0}
              className="p-1.5 rounded-md text-txt-muted hover:text-txt-main hover:bg-bg-hover disabled:opacity-30 transition-all"
              title="Undo (Ctrl+Z)"
            >
              <Undo size={14} />
            </button>
            <button
              onClick={redo}
              disabled={futureSubtitles.length === 0}
              className="p-1.5 rounded-md text-txt-muted hover:text-txt-main hover:bg-bg-hover disabled:opacity-30 transition-all"
              title="Redo (Ctrl+Y)"
            >
              <Redo size={14} />
            </button>
            <button
              onClick={() => setPreviewMode(!isPreviewMode)}
              disabled={actionsDisabled}
              className={cn(
                'p-1.5 rounded-md transition-all',
                isPreviewMode
                  ? 'text-red-400 bg-red-500/10'
                  : 'text-txt-muted hover:text-txt-main hover:bg-bg-hover',
                actionsDisabled && 'opacity-30 cursor-not-allowed',
              )}
              title={isPreviewMode ? t('results.closePreview') : t('results.openPreview')}
            >
              {isPreviewMode ? <EyeOff size={14} /> : <Play size={14} />}
            </button>
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-[10px] font-bold bg-bg-panel border border-border-strong hover:border-brand-500 hover:text-brand-400 text-txt-muted px-3 py-1.5 rounded-md transition-colors uppercase tracking-wide shadow-sm"
        >
          <Upload size={12} />
          {t('results.importSrt')}
        </button>
        <input type="file" ref={fileInputRef} onChange={handleImportSrt} accept=".srt" className="hidden" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide bg-bg-main">
        <SubtitleList />
      </div>

      <div className="p-3 border-t border-border-main bg-bg-panel shrink-0">
        {!isBlurMode ? (
          <div className="flex gap-2">
            <ExportMenu
              disabled={actionsDisabled}
              onExportSrt={exportSrt}
              onExportEmotion={() => setEmotionOpen(true)}
              onImportEmotionJson={handleImportEmotionJson}
            />
            <Button
              variant="secondary"
              className="flex-1 h-10 text-xs font-semibold bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border-purple-500/30"
              disabled={actionsDisabled}
              onClick={() => setBlurMode(true)}
              icon={<ScanFace size={14} />}
            >
              {t('results.smartBlur')}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {renderedVideoUrl && (
              <Button
                variant="success"
                className="w-full h-10 text-sm font-semibold"
                onClick={handleDownloadVideo}
                icon={<FileVideo size={16} />}
              >
                {t('results.downloadVideo')}
              </Button>
            )}
            <Button
              variant="secondary"
              className="w-full h-10 text-sm font-semibold"
              onClick={() => setBlurMode(false)}
              icon={<ArrowLeft size={14} />}
            >
              {t('results.backToSubtitles')}
            </Button>
          </div>
        )}
        <EmotionExportDialog open={emotionOpen} onClose={() => setEmotionOpen(false)} />
      </div>
    </GlassPanel>
  );
};
