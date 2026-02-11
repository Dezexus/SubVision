import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { ProgressHeader } from './components/ProgressHeader';
import { SubtitleList } from './components/SubtitleList';
import { useSocket } from '../../hooks/useSocket';
import { useAppStore } from '../../store/useAppStore';

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
    if (!metadata) return;
    const link = document.createElement('a');
    link.href = `http://localhost:7860/uploads/${metadata.filename.replace(/\.[^/.]+$/, "")}.srt`;
    link.download = `${metadata.filename}.srt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <GlassPanel className="w-full lg:w-1/4 min-w-[320px] flex flex-col h-full z-20 bg-[#1e1e1e]">
      <ProgressHeader />

      {/* Scrollable List */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-hide bg-[#1e1e1e]">
         <SubtitleList />
      </div>

      {/* Footer: Stats + Action */}
      <div className="p-4 border-t border-[#333333] bg-[#252526] space-y-3">

        {/* Statistics Row */}
        {subtitles.length > 0 && (
          <div className="flex justify-between text-xs text-[#858585] font-mono px-1">
            <span>Total: <b className="text-[#F0F0F0]">{stats.total}</b></span>
            <span>Low Conf: <b className={stats.lowConf > 0 ? "text-red-400" : "text-[#F0F0F0]"}>{stats.lowConf}</b></span>
            <span>Avg: <b className="text-[#F0F0F0]">{stats.avgConf}%</b></span>
          </div>
        )}

        <Button
          variant="primary"
          className="w-full py-3 h-11 text-sm font-semibold shadow-md"
          disabled={isProcessing || !metadata}
          onClick={handleDownload}
          icon={<Download size={16} />}
        >
          DOWNLOAD .SRT
        </Button>
      </div>
    </GlassPanel>
  );
};
