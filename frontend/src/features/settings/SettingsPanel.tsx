import React, { useEffect } from 'react';
import { Play, Square, RefreshCw } from 'lucide-react';
import { useVideoStore } from '../../store/videoStore';
import { useProcessingStore } from '../../store/processingStore';
import { useBlurStore } from '../../store/blurStore';
import { useConfigStore } from '../../store/configStore';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { Button } from '../../components/ui/Button';
import { api } from '../../services/api';
import { useStartOcr } from '../../commands/useStartOcr';
import { useStopOcr } from '../../commands/useStopOcr';

import { PresetSelector } from './components/PresetSelector';
import { AdvancedSettings } from './components/AdvancedSettings';
import { BlurControlPanel } from '../blur/BlurControlPanel';

export const SettingsPanel = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const roi = useVideoStore((s) => s.roi);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const resetProject = useVideoStore((s) => s.resetProject);

  const config = useConfigStore((s) => s.config);
  const preset = useConfigStore((s) => s.preset);
  const defaultConfig = useConfigStore((s) => s.defaultConfig);
  const setConfig = useConfigStore((s) => s.setConfig);
  const setPreset = useConfigStore((s) => s.setPreset);
  const setDefaultConfig = useConfigStore((s) => s.setDefaultConfig);

  const { execute: startOcr } = useStartOcr();
  const { execute: stopOcr } = useStopOcr();

  useEffect(() => {
    const fetchProcessDefaults = async () => {
      try {
        const defaults = await api.getDefaultProcessConfig();
        setDefaultConfig(defaults);
        if (!preset) setPreset(defaults.preset || '');
      } catch (error) {
        console.error(error);
      }
    };
    if (!defaultConfig) fetchProcessDefaults();
  }, [defaultConfig, preset, setDefaultConfig, setPreset]);

  const handleStart = () => {
    if (!metadata || !clientId) return;
    const processConfig = {
      filename: metadata.filename,
      client_id: clientId,
      roi,
      preset: preset || defaultConfig?.preset || '',
      languages: config.languages || defaultConfig?.languages || 'en',
      step: config.step ?? defaultConfig?.step ?? 2,
      conf_threshold: config.conf_threshold ?? defaultConfig?.conf_threshold ?? 80,
      scale_factor: config.scale_factor ?? defaultConfig?.scale_factor ?? 2.0,
      smart_skip: config.smart_skip ?? defaultConfig?.smart_skip ?? true,
    };
    startOcr(processConfig);
  };

  const handleStop = () => {
    stopOcr();
  };

  return (
    <GlassPanel className="w-[360px] flex flex-col h-full z-20 bg-bg-main">
      <div className="p-5 border-b border-border-main flex justify-between items-center bg-bg-panel">
        <h2 className="font-bold text-txt-main uppercase tracking-wider text-sm">
          {isBlurMode ? 'Blur Settings' : 'Project Settings'}
        </h2>
        <button
          onClick={resetProject}
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
          <div className="p-5 space-y-8">
            <PresetSelector preset={preset} setPreset={setPreset} setConfig={setConfig} />
            <div className="h-px bg-border-main" />
            <AdvancedSettings config={config} setConfig={setConfig} defaultConfig={defaultConfig} />
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