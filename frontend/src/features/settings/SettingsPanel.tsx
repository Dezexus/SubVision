/**
 * Main settings panel coordinating project processing and blur configurations.
 */
import React from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';

import { PresetSelector } from './components/PresetSelector';
import { AdvancedSettings } from './components/AdvancedSettings';
import { BlurControlPanel } from '../blur/BlurControlPanel';

export const SettingsPanel = () => {
  const {
    metadata,
    isProcessing,
    setProcessing,
    config,
    preset,
    roi,
    clientId,
    addLog,
    setFile,
    isBlurMode
  } = useAppStore();

  const handleStart = async () => {
    if (!metadata) return;
    setProcessing(true);
    addLog('--- Starting Process ---');
    try {
      await api.startProcessing({
        filename: metadata.filename,
        client_id: clientId,
        roi: roi,
        preset: preset,
        languages: config.languages || 'en',
        ...config
      });
    } catch (error) {
      addLog('Error: Failed to start processing.');
      setProcessing(false);
    }
  };

  const handleStop = async () => {
    try {
      await api.stopProcessing(clientId);
    } catch (e) {
      console.error("Failed to send stop signal", e);
      setProcessing(false);
    }
  };

  return (
    <GlassPanel className="w-[360px] flex flex-col h-full z-20 bg-[#1e1e1e]">
      <div className="p-5 border-b border-[#2d2d2d] flex justify-between items-center bg-[#252526]">
        <h2 className="font-bold text-white uppercase tracking-wider text-sm">
            {isBlurMode ? 'Blur Settings' : 'Project Settings'}
        </h2>
        <button
          onClick={() => setFile(null as any)}
          className="p-2 hover:bg-[#333333] rounded text-[#9E9E9E] hover:text-white transition"
          title="New Project"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide bg-[#1e1e1e]">
        {isBlurMode ? (
            <BlurControlPanel />
        ) : (
            <div className="p-5 space-y-8">
                <PresetSelector />
                <div className="h-px bg-[#2d2d2d]" />
                <AdvancedSettings />
            </div>
        )}
      </div>

      {!isBlurMode && (
          <div className="p-5 border-t border-[#2d2d2d] bg-[#252526]">
            {!isProcessing ? (
              <Button
                onClick={handleStart}
                variant="success"
                className="w-full py-3.5 text-base font-semibold shadow-lg"
                icon={<Play size={20} fill="currentColor" />}
                disabled={!metadata}
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
