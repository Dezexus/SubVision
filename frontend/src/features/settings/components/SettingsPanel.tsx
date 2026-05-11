/**
 * Renders the settings panel for configuring OCR options and navigating to blur settings.
 */
import React, { useState, useEffect } from 'react';
import { Play, Square, RefreshCw, ChevronLeft, ChevronRight, Settings2, AlertTriangle } from 'lucide-react';
import { useVideoStore } from '../../../store/videoStore';
import { useTaskStore } from '../../../store/taskStore';
import { useBlurStore } from '../../../store/blurStore';
import { useConfigStore } from '../../../store/configStore';
import { GlassPanel } from '../../../components/ui/GlassPanel';
import { Button } from '../../../components/ui/Button';
import { PresetSelector } from './PresetSelector';
import { LanguageSelector } from './LanguageSelector';
import { BlurControlPanel } from '../../blur';
import { useStartOcr } from '../hooks/useStartOcr';
import { useStopOcr } from '../hooks/useStopOcr';

export const SettingsPanel = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const roi = useVideoStore((s) => s.roi);
  const resetProject = useVideoStore((s) => s.resetProject);
  
  const isProcessing = useTaskStore((s) => s.isProcessing);
  const activeOcrJobId = useTaskStore((s) => s.activeOcrJobId);
  const activeBlurJobId = useTaskStore((s) => s.activeBlurJobId);
  
  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const config = useConfigStore((s) => s.config);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const { execute: startOcr } = useStartOcr();
  const { execute: stopOcr } = useStopOcr();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (confirmReset) {
      timer = setTimeout(() => setConfirmReset(false), 3000);
    }
    return () => clearTimeout(timer);
  }, [confirmReset]);

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
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    resetProject();
    setConfirmReset(false);
  };

  const hasActiveJob = !!activeOcrJobId || !!activeBlurJobId;

  return (
    <GlassPanel className={`transition-all duration-300 ease-in-out flex flex-col h-full z-20 bg-bg-main ${isCollapsed ? 'w-[64px]' : 'w-[360px]'}`}>
      <div className="p-4 border-b border-border-main flex justify-between items-center bg-bg-panel h-14 shrink-0">
        {!isCollapsed && (
          <h2 className="font-bold text-txt-main uppercase tracking-wider text-sm whitespace-nowrap overflow-hidden">
            {isBlurMode ? 'Blur Settings' : 'Project Settings'}
          </h2>
        )}
        <div className={`flex items-center gap-1 ${isCollapsed ? 'mx-auto' : ''}`}>
          {!isCollapsed && (
            <button
              onClick={handleReset}
              className={`p-2 rounded transition-colors flex items-center gap-2 ${
                confirmReset 
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' 
                  : 'hover:bg-bg-surface text-txt-dim hover:text-txt-main'
              }`}
              title={confirmReset ? "Click again to confirm" : "New Project"}
            >
              {confirmReset ? <AlertTriangle size={16} /> : <RefreshCw size={16} />}
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 hover:bg-bg-surface rounded text-txt-dim hover:text-txt-main transition-colors"
            title={isCollapsed ? "Expand panel" : "Collapse panel"}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto scrollbar-hide bg-bg-main ${isCollapsed ? 'hidden' : 'block'}`}>
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

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center py-4 space-y-4 bg-bg-main">
          <div className="w-8 h-8 rounded-full bg-bg-surface flex items-center justify-center text-brand-500 shadow-sm border border-border-strong">
            <Settings2 size={16} />
          </div>
        </div>
      )}

      {!isBlurMode && !isCollapsed && (
        <div className="p-5 border-t border-border-main bg-bg-panel shrink-0">
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

      {!isBlurMode && isCollapsed && (
        <div className="p-3 border-t border-border-main bg-bg-panel flex justify-center shrink-0">
          {!isProcessing ? (
            <button 
              onClick={handleStart} 
              disabled={!metadata || hasActiveJob} 
              className="p-2.5 bg-brand-500 text-white rounded-full disabled:opacity-50 disabled:grayscale transition-transform hover:scale-105 active:scale-95 shadow-md"
              title="Start Processing"
            >
              <Play size={18} fill="currentColor" />
            </button>
          ) : (
            <button 
              onClick={handleStop} 
              className="p-2.5 bg-red-500 text-white rounded-full transition-transform hover:scale-105 active:scale-95 shadow-md animate-pulse"
              title="Stop Processing"
            >
              <Square size={18} fill="currentColor" />
            </button>
          )}
        </div>
      )}
    </GlassPanel>
  );
};