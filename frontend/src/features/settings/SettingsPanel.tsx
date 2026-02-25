/**
 * Main settings panel coordinating project processing and blur configurations.
 */
import React, { useEffect } from 'react';
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
    isBlurMode,
    defaultConfig,
    setDefaultConfig,
    setPreset,
    resetProject
  } = useAppStore();

  useEffect(() => {
    const fetchProcessDefaults = async () => {
      try {
        const defaults = await api.getDefaultProcessConfig();
        setDefaultConfig(defaults);
        if (defaults.preset && !preset) {
          setPreset(defaults.preset);
        }
      } catch (error) {
        console.error(error);
      }
    };

    if (!defaultConfig) {
      fetchProcessDefaults();
    }
  }, [defaultConfig, setDefaultConfig, setPreset, preset]);

  const handleStart = async () => {
    if (!metadata || !defaultConfig) return;
    setProcessing(true);
    addLog('--- Starting Process ---');
    try {
      await api.startProcessing({
        filename: metadata.filename,
        client_id: clientId,
        roi: roi,
        preset: preset || defaultConfig.preset!,
        languages: config.languages || defaultConfig.languages!,
        step: config.step ?? defaultConfig.step!,
        conf_threshold: config.conf_threshold ?? defaultConfig.conf_threshold!,
        scale_factor: config.scale_factor ?? defaultConfig.scale_factor!,
        smart_skip: config.smart_skip ?? defaultConfig.smart_skip!
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
                <PresetSelector />
                <div className="h-px bg-border-main" />
                <AdvancedSettings />
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
