import React from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import { useVideoStore } from '../../store/videoStore';
import { useProcessingStore } from '../../store/processingStore';
import { useBlurStore } from '../../store/blurStore';
import { useConfigStore } from '../../store/configStore';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { useStartOcr } from '../../commands/useStartOcr';
import { useStopOcr } from '../../commands/useStopOcr';
import { PresetSelector } from './components/PresetSelector';
import { LanguageSelector } from './components/LanguageSelector';
import { BlurControlPanel } from '../blur/BlurControlPanel';

export const SettingsPanel = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const roi = useVideoStore((s) => s.roi);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const activeOcrJobId = useProcessingStore((s) => s.activeOcrJobId);
  const activeBlurJobId = useProcessingStore((s) => s.activeBlurJobId);
  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const resetProject = useVideoStore((s) => s.resetProject);
  const config = useConfigStore((s) => s.config);

  const { execute: startOcr } = useStartOcr();
  const { execute: stopOcr } = useStopOcr();

  const handleStart = () => {
    if (!metadata || !clientId) return;
    const processConfig = {
      filename: metadata.filename,
      client_id: clientId,
      roi,
      preset: config.preset || '⚖️ Balance',
      languages: config.languages || 'en'
    };
    startOcr(processConfig);
  };

  const handleStop = () => {
    stopOcr();
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to start a new project? All unsaved progress will be lost.')) {
      resetProject();
    }
  };

  const hasActiveJob = !!activeOcrJobId || !!activeBlurJobId;

  return (
    <GlassPanel className="w-[360px] flex flex-col h-full z-20 bg-bg-main">
      <div className="p-5 border-b border-border-main flex justify-between items-center bg-bg-panel">
        <h2 className="font-bold text-txt-main uppercase tracking-wider text-sm">
          {isBlurMode ? 'Blur Settings' : 'Project Settings'}
        </h2>
        <button
          onClick={handleReset}
          className="p-2 hover:bg-bg-surface rounded text-txt-dim hover:text-txt-main transition"
          title="New Project"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide bg-bg-main">
        {isBlurMode ? (
          <BlurControlPanel />
        ) : (
          <div className="p-5 space-y-6">
            <PresetSelector />
            <div className="w-full h-px bg-border-main" />
            <LanguageSelector />
          </div>
        )}
      </div>

      {!isBlurMode && (
        <div className="p-5 border-t border-border-main bg-bg-panel">
          {!isProcessing ? (
            <Button
              onClick={handleStart}
              variant="success"
              className="w-full py-3.5 text-base font-semibold shadow-lg"
              icon={<Play size={20} fill="currentColor" />}
              disabled={!metadata || hasActiveJob}
            >
              START PROCESSING
            </Button>
          ) : (
            <Button
              onClick={handleStop}
              variant="danger"
              className="w-full py-3.5 text-base font-semibold shadow-lg"
              icon={<Square size={20} fill="currentColor" />}
            >
              STOP
            </Button>
          )}
        </div>
      )}
    </GlassPanel>
  );
};