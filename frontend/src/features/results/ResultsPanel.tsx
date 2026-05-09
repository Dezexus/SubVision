import React from 'react';
import { Download, ScanFace, ArrowLeft, Upload, FileVideo, Play, EyeOff, Undo, Redo, Scissors } from 'lucide-react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { SubtitleList } from './components/SubtitleList';
import { useVideoStore } from '../../store/videoStore';
import { useProcessingStore } from '../../store/processingStore';
import { useBlurStore } from '../../store/blurStore';
import { useExportSrt } from '../../commands/useExportSrt';
import { useImportSrt } from '../../commands/useImportSrt';
import { useStartBlurRender } from '../../commands/useStartBlurRender';

export const ResultsPanel = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const subtitles = useProcessingStore((s) => s.subtitles);
  const pastSubtitles = useProcessingStore((s) => s.pastSubtitles);
  const futureSubtitles = useProcessingStore((s) => s.futureSubtitles);
  const undo = useProcessingStore((s) => s.undo);
  const redo = useProcessingStore((s) => s.redo);
  const renderedVideoUrl = useProcessingStore((s) => s.renderedVideoUrl);

  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const setBlurMode = useBlurStore((s) => s.setBlurMode);
  const blurSettings = useBlurStore((s) => s.blurSettings);

  const isPreviewMode = useVideoStore((s) => s.isPreviewMode);
  const setPreviewMode = useVideoStore((s) => s.setPreviewMode);

  const { execute: exportSrt } = useExportSrt();
  const { execute: importSrt } = useImportSrt();
  const { execute: startBlurRender } = useStartBlurRender();

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImportSrt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importSrt(file);
    e.target.value = '';
  };

  const handleRenderBlur = () => {
    if (!metadata || !clientId) return;
    startBlurRender({
      filename: metadata.filename,
      client_id: clientId,
      subtitles: subtitles,
      blur_settings: blurSettings,
    });
  };

  const handleDownloadVideo = () => {
    if (!renderedVideoUrl || !metadata) return;
    const downloadLink = renderedVideoUrl.startsWith('http')
      ? renderedVideoUrl
      : `${import.meta.env.VITE_API_URL || 'http://localhost:7860'}${renderedVideoUrl}`;
    const link = document.createElement('a');
    link.href = downloadLink;
    const safeName = metadata.filename.replace(/\.[^/.]+$/, "");
    link.download = `blurred_${safeName}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <GlassPanel className="flex flex-col h-full bg-bg-main">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border-main bg-bg-surface/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-txt-main">
            <Scissors size={14} className="text-brand-500" />
            <span className="text-xs font-bold uppercase tracking-wider">Editor</span>
          </div>
          <div className="flex items-center gap-1 border-l border-border-strong pl-3">
            <button
              onClick={undo}
              disabled={pastSubtitles.length === 0}
              className="p-1.5 rounded-md text-txt-muted hover:text-txt-main hover:bg-bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Undo (Ctrl+Z)"
            >
              <Undo size={14} />
            </button>
            <button
              onClick={redo}
              disabled={futureSubtitles.length === 0}
              className="p-1.5 rounded-md text-txt-muted hover:text-txt-main hover:bg-bg-hover disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Redo (Ctrl+Y)"
            >
              <Redo size={14} />
            </button>
          </div>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 text-[10px] font-bold bg-bg-panel border border-border-strong hover:border-brand-500 hover:text-brand-400 text-txt-muted px-3 py-1.5 rounded-md transition-colors uppercase tracking-wide shadow-sm"
          title="Import .SRT"
        >
          <Upload size={12} />
          Import SRT
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImportSrt}
          accept=".srt"
          className="hidden"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 scrollbar-hide bg-bg-main">
        <SubtitleList />
      </div>

      <div className="p-4 border-t border-border-main bg-bg-panel space-y-4 shrink-0">
        {subtitles.length > 0 && (
          <div className="flex justify-between items-center text-xs text-txt-subtle font-mono px-1">
            <span className="uppercase tracking-wider text-[10px] font-bold">Total Lines</span>
            <b className="text-txt-main text-sm">{subtitles.length}</b>
          </div>
        )}
        <div className="flex flex-col gap-3">
          {!isBlurMode ? (
            <>
              <Button
                variant={isPreviewMode ? "danger" : "secondary"}
                className={`w-full py-3 h-11 text-xs font-semibold shadow-md border ${isPreviewMode ? 'border-red-500/50' : 'border-border-strong bg-bg-surface hover:bg-bg-input-hover text-white'}`}
                disabled={isProcessing || !metadata || subtitles.length === 0}
                onClick={() => setPreviewMode(!isPreviewMode)}
                icon={isPreviewMode ? <EyeOff size={16} /> : <Play size={16} />}
              >
                {isPreviewMode ? 'CLOSE PREVIEW' : 'OPEN PREVIEW'}
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="primary"
                  className="py-3 h-11 text-xs font-semibold shadow-md"
                  disabled={isProcessing || !metadata || subtitles.length === 0}
                  onClick={exportSrt}
                  icon={<Download size={14} />}
                >
                  EXPORT SRT
                </Button>
                <Button
                  variant="secondary"
                  className="py-3 h-11 text-xs font-semibold shadow-md bg-purple-600/10 hover:bg-purple-600/20 text-purple-300 border-purple-500/30 transition-colors"
                  disabled={isProcessing || !metadata || subtitles.length === 0}
                  onClick={() => setBlurMode(true)}
                  icon={<ScanFace size={14} />}
                >
                  SMART BLUR
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {renderedVideoUrl && (
                <Button
                  variant="success"
                  className="w-full py-3 h-11 text-sm font-semibold shadow-lg animate-in fade-in slide-in-from-bottom-2"
                  onClick={handleDownloadVideo}
                  icon={<FileVideo size={18} />}
                >
                  DOWNLOAD VIDEO
                </Button>
              )}
              <Button
                variant="secondary"
                className="w-full py-3 h-11 text-sm font-semibold shadow-md bg-bg-surface hover:bg-bg-input-hover border-border-strong"
                onClick={() => setBlurMode(false)}
                icon={<ArrowLeft size={16} />}
              >
                BACK TO SUBTITLES
              </Button>
            </div>
          )}
        </div>
      </div>
    </GlassPanel>
  );
};