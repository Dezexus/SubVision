import { useEffect, useRef } from 'react';
import { Play, Square, ChevronLeft, ChevronRight, Settings2, Crop } from 'lucide-react';
import { useVideoStore } from '../../../store/videoStore';
import { useProcessingStore } from '../../../store/processingStore';
import { useBlurStore } from '../../../store/blurStore';
import { useLayoutStore } from '../../../store/layoutStore';
import { useConfigStore, defaultConfig } from '../../../store/configStore';
import { GlassPanel, Button } from '../../../shared/ui';
import { PresetSelector } from './PresetSelector';
import { AdvancedSettings } from './AdvancedSettings';
import { BlurControlPanel } from '../../blur';
import { useStartOcr } from '../mutations/useStartOcr';
import { useStopOcr } from '../mutations/useStopOcr';
import { useDefaultProcessConfigQuery } from '../queries/useDefaultProcessConfigQuery';
import { useTranslation } from '../../../i18n';
import type { ProcessConfig } from '../../../types';

/**
 * Left column: OCR settings in the recognition stage, blur settings in the removal stage.
 */
export const SettingsPanel = () => {
  const { t } = useTranslation();
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const rois = useVideoStore((s) => s.rois);
  const isProcessing = useProcessingStore((s) => s.isProcessing);
  const activeOcrJobId = useProcessingStore((s) => s.activeOcrJobId);
  const activeBlurJobId = useProcessingStore((s) => s.activeBlurJobId);
  const isBlurMode = useBlurStore((s) => s.isBlurMode);
  const isCollapsed = useLayoutStore((s) => s.leftCollapsed);
  const toggleCollapsed = useLayoutStore((s) => s.toggleCollapsed);
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);

  const { execute: startOcr } = useStartOcr();
  const { execute: stopOcr } = useStopOcr();
  const { data: serverDefaults } = useDefaultProcessConfigQuery();
  const configInitialized = useRef(false);

  useEffect(() => {
    if (serverDefaults && !configInitialized.current) {
      setConfig(serverDefaults);
      configInitialized.current = true;
    }
  }, [serverDefaults, setConfig]);

  const uiDefaults = serverDefaults ?? defaultConfig;

  // Without a box the first region means "whole frame": slow and full of noise.
  const hasRegion = rois[0]?.[2] > 0 && rois[0]?.[3] > 0;
  const hasActiveJob = !!activeOcrJobId || !!activeBlurJobId;
  const startDisabled = !metadata || hasActiveJob || !hasRegion;
  const startHint = !hasRegion ? t('settings.noRegion') : undefined;

  const handleStart = () => {
    if (!metadata || !clientId || !hasRegion) return;
    const processConfig: ProcessConfig = {
      filename: metadata.filename,
      client_id: clientId,
      roi: rois[0],
      rois,
      preset: config.preset || '⚖️ Balance',
      languages: config.languages || 'en',
      step: config.step,
      conf_threshold: config.conf_threshold,
      denoise_strength: config.denoise_strength,
      smart_skip: config.smart_skip,
      motion_mse_thresh: config.motion_mse_thresh,
      gap_tolerance: config.gap_tolerance,
    };
    startOcr(processConfig);
  };

  const handleStop = () => {
    stopOcr();
  };

  return (
    <GlassPanel className="flex flex-col h-full w-full min-h-0 z-20 bg-bg-main">
      <div className="p-4 border-b border-border-main flex justify-between items-center bg-bg-panel h-14 shrink-0">
        {!isCollapsed && (
          <h2 className="font-bold text-txt-main uppercase tracking-wider text-sm whitespace-nowrap overflow-hidden">
            {isBlurMode ? t('settings.blurTitle') : t('settings.title')}
          </h2>
        )}
        <button
          onClick={() => toggleCollapsed('left')}
          className={`p-2 hover:bg-bg-surface rounded text-txt-dim hover:text-txt-main transition-colors ${isCollapsed ? 'mx-auto' : ''}`}
          title={isCollapsed ? t('settings.expandPanel') : t('settings.collapsePanel')}
          aria-label={isCollapsed ? t('settings.expandPanel') : t('settings.collapsePanel')}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto scrollbar-hide bg-bg-main ${isCollapsed ? 'hidden' : 'block'}`}>
        {isBlurMode ? (
          <BlurControlPanel />
        ) : (
          <div className="p-5 space-y-6">
            <PresetSelector />
            <div className="w-full h-px bg-border-main" />
            <AdvancedSettings
              config={config}
              setConfig={setConfig}
              defaultConfig={uiDefaults}
            />
          </div>
        )}
      </div>

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center py-4 space-y-4 bg-bg-main">
          <div className="w-8 h-8 rounded-full bg-bg-surface flex items-center justify-center text-brand-500 shadow-sm border border-border-strong">
            <Settings2 size={16} aria-hidden />
          </div>
        </div>
      )}

      {!isBlurMode && !isCollapsed && (
        <div className="p-5 border-t border-border-main bg-bg-panel shrink-0 space-y-2.5">
          {!isProcessing ? (
            <Button
              onClick={handleStart}
              variant="success"
              className="w-full py-3.5 text-base font-semibold shadow-lg"
              icon={<Play size={20} fill="currentColor" />}
              disabled={startDisabled}
              aria-describedby={startHint ? 'ocr-start-hint' : undefined}
            >
              {t('settings.start')}
            </Button>
          ) : (
            <Button
              onClick={handleStop}
              variant="danger"
              className="w-full py-3.5 text-base font-semibold shadow-lg"
              icon={<Square size={20} fill="currentColor" />}
            >
              {t('settings.stop')}
            </Button>
          )}
          {!isProcessing && startHint && (
            <p id="ocr-start-hint" className="flex items-center gap-2 text-xs text-amber-400">
              <Crop size={14} className="shrink-0" aria-hidden />
              {startHint}
            </p>
          )}
        </div>
      )}

      {!isBlurMode && isCollapsed && (
        <div className="p-3 border-t border-border-main bg-bg-panel flex justify-center shrink-0">
          {!isProcessing ? (
            <button
              onClick={handleStart}
              disabled={startDisabled}
              className="p-2.5 bg-brand-500 text-white rounded-full disabled:opacity-50 disabled:grayscale transition-transform hover:scale-105 active:scale-95 shadow-md"
              title={startHint ?? t('settings.start')}
              aria-label={t('settings.start')}
            >
              <Play size={18} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="p-2.5 bg-red-500 text-white rounded-full transition-transform hover:scale-105 active:scale-95 shadow-md animate-pulse"
              title={t('settings.stop')}
              aria-label={t('settings.stop')}
            >
              <Square size={18} fill="currentColor" />
            </button>
          )}
        </div>
      )}
    </GlassPanel>
  );
};
