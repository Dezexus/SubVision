import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { ProgressHeader } from './components/ProgressHeader';
import { SubtitleList } from './components/SubtitleList';
import { useSocket } from '../../hooks/useSocket';
import { useAppStore } from '../../store/useAppStore';

const formatSrtTime = (seconds: number) => {
  const date = new Date(0);
  date.setSeconds(seconds);
  date.setMilliseconds((seconds % 1) * 1000);
  const iso = date.toISOString().substr(11, 12);
  return iso.replace('.', ',');
};

export const ResultsPanel = () => {
  useSocket();
  const { isProcessing, metadata, subtitles } = useAppStore();

  const stats = useMemo(() => {
    const total = subtitles.length;
    const lowConf = subtitles.filter(s => s.conf < 0.6).length;
    const avgConf = total > 0
      ? Math.round(subtitles.reduce((acc, s) => acc + s.conf, 0) / total * 100)
      : 0;
    return { total, lowConf, avgConf };
  }, [subtitles]);

  const handleDownload = () => {
    if (!metadata || subtitles.length === 0) return;

    let srtContent = "";
    subtitles.forEach((sub, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${formatSrtTime(sub.start)} --> ${formatSrtTime(sub.end)}\n`;
      srtContent += `${sub.text}\n\n`;
    });

    // ИСПРАВЛЕНИЕ: Используем 'application/octet-stream', чтобы браузер точно скачал файл
    const blob = new Blob([srtContent], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    // Убедимся, что имя файла корректное
    const safeName = metadata.filename.replace(/\.[^/.]+$/, "");
    link.download = `${safeName}_edited.srt`;

    document.body.appendChild(link);
    link.click();

    // Чистим за собой
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <GlassPanel className="w-full lg:w-1/4 min-w-[320px] flex flex-col h-full z-20 bg-[#1e1e1e]">
      <ProgressHeader />

      <div className="flex-1 overflow-y-auto p-2 scrollbar-hide bg-[#1e1e1e]">
         <SubtitleList />
      </div>

      <div className="p-4 border-t border-[#333333] bg-[#252526] space-y-3">
        {subtitles.length > 0 && (
          <div className="flex justify-between text-xs text-[#858585] font-mono px-1">
            <span>Lines: <b className="text-[#F0F0F0]">{stats.total}</b></span>
            <span>Edits: <b className="text-brand-400">Ready</b></span>
          </div>
        )}

        <Button
          variant="primary"
          className="w-full py-3 h-11 text-sm font-semibold shadow-md"
          disabled={isProcessing || !metadata || subtitles.length === 0}
          onClick={handleDownload}
          icon={<Download size={16} />}
        >
          DOWNLOAD EDITED .SRT
        </Button>
      </div>
    </GlassPanel>
  );
};
