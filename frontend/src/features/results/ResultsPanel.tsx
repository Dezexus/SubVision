import React, { useMemo, useRef } from 'react';
import { Download, ScanFace, ArrowLeft, Upload, FileVideo } from 'lucide-react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { ProgressHeader } from './components/ProgressHeader';
import { SubtitleList } from './components/SubtitleList';
import { useAppStore } from '../../store/useAppStore';
import { api } from '../../services/api';

const formatSrtTime = (seconds: number) => {
  const date = new Date(0);
  date.setSeconds(seconds);
  date.setMilliseconds((seconds % 1) * 1000);
  const iso = date.toISOString().substr(11, 12);
  return iso.replace('.', ',');
};

export const ResultsPanel = () => {
  const {
    isProcessing,
    metadata,
    subtitles,
    isBlurMode,
    setBlurMode,
    setSubtitles,
    addLog,
    renderedVideoUrl
  } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    const total = subtitles.length;
    return { total };
  }, [subtitles]);

  const handleDownloadSrt = () => {
    if (!metadata || subtitles.length === 0) return;

    let srtContent = "";
    subtitles.forEach((sub, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n`;
      srtContent += `${sub.text}\n\n`;
    });

    const blob = new Blob(['\uFEFF', srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const safeName = metadata.filename.replace(/\.[^/.]+$/, "");
    link.download = `${safeName}_edited.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportSrt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    addLog(`Importing ${file.name}...`);
    try {
      const subs = await api.importSrt(file);
      setSubtitles(subs);
      addLog(`Imported ${subs.length} subtitles.`);
    } catch (err) {
      console.error(err);
      addLog("Error importing SRT.");
    }

    e.target.value = '';
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
    <GlassPanel className="w-full lg:w-1/4 min-w-[320px] flex flex-col h-full z-20 bg-[#1e1e1e]">
      <ProgressHeader />

      <div className="flex items-center justify-between p-2 border-b border-[#333333] bg-[#252526]">
         <span className="text-xs font-bold text-[#858585] px-2">SUBTITLES</span>
         <button
           onClick={() => fileInputRef.current?.click()}
           className="flex items-center gap-1 text-[10px] bg-[#333333] hover:bg-[#404040] text-[#C5C5C5] px-2 py-1 rounded transition"
           title="Import .SRT"
         >
           <Upload size={10} />
           IMPORT SRT
         </button>
         <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportSrt}
            accept=".srt"
            className="hidden"
         />
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-hide bg-[#1e1e1e]">
         <SubtitleList />
      </div>

      <div className="p-4 border-t border-[#333333] bg-[#252526] space-y-3">
        {subtitles.length > 0 && (
          <div className="flex justify-between text-xs text-[#858585] font-mono px-1">
            <span>Lines: <b className="text-[#F0F0F0]">{stats.total}</b></span>
          </div>
        )}

        <div className="flex flex-col gap-2">
            {!isBlurMode ? (
                <div className="flex gap-2">
                    <Button
                        variant="primary"
                        className="flex-1 py-3 h-11 text-xs font-semibold shadow-md"
                        disabled={isProcessing || !metadata || subtitles.length === 0}
                        onClick={handleDownloadSrt}
                        icon={<Download size={14} />}
                    >
                        SRT
                    </Button>
                    <Button
                        variant="secondary"
                        className="flex-1 py-3 h-11 text-xs font-semibold shadow-md bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border-purple-500/30"
                        disabled={isProcessing || !metadata || subtitles.length === 0}
                        onClick={() => setBlurMode(true)}
                        icon={<ScanFace size={14} />}
                    >
                        BLUR
                    </Button>
                </div>
            ) : (
                <div className="space-y-2">
                    {renderedVideoUrl && (
                        <Button
                            variant="success"
                            className="w-full py-3 h-11 text-sm font-semibold shadow-md animate-in fade-in slide-in-from-bottom-2"
                            onClick={handleDownloadVideo}
                            icon={<FileVideo size={16} />}
                        >
                            DOWNLOAD VIDEO
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        className="w-full py-3 h-11 text-sm font-semibold shadow-md"
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
