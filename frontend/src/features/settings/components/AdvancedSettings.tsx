import { Globe } from 'lucide-react';
import { Slider, Switch } from '../../../shared/ui';
import { useLanguagesQuery } from '../queries/useLanguagesQuery';
import { useTranslation } from '../../../i18n';
import type { OcrSettings } from '../../../types';

interface Props {
  config: OcrSettings;
  setConfig: (updates: Partial<OcrSettings>) => void;
  defaultConfig: OcrSettings;
}

export const AdvancedSettings = ({ config, setConfig, defaultConfig }: Props) => {
  const { t } = useTranslation();
  const { data: availableLanguages = [] } = useLanguagesQuery();

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <label className="text-xs font-bold uppercase tracking-wide text-txt-muted select-none flex items-center gap-1.5">
          <Globe size={12} /> {t('settings.ocrLanguage')}
        </label>
        <div className="relative">
          <select
            value={config.languages || defaultConfig.languages || 'en'}
            onChange={(e) => setConfig({ languages: e.target.value })}
            className="w-full bg-bg-input border border-border-strong rounded-md text-sm text-txt-main px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-500 appearance-none cursor-pointer font-medium"
          >
            {availableLanguages.length === 0 ? (
              <option value="en">{t('settings.langEn')}</option>
            ) : (
              availableLanguages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))
            )}
          </select>
        </div>
        <p className="text-[11px] leading-snug text-txt-muted select-none">
          {t('settings.ocrEngineNote')}
        </p>
      </div>

      <Slider
        label={t('settings.minConfidence')}
        min={50} max={100} step={1}
        value={config.conf_threshold ?? defaultConfig.conf_threshold ?? 0}
        valueDisplay={`${config.conf_threshold ?? defaultConfig.conf_threshold ?? 0}%`}
        onChange={(e) => setConfig({ conf_threshold: Number(e.target.value) })}
      />

      <Slider
        label={t('settings.scanStep')}
        min={1} max={10} step={1}
        value={config.step ?? defaultConfig.step ?? 0}
        valueDisplay={String(config.step ?? defaultConfig.step ?? 0)}
        onChange={(e) => setConfig({ step: Number(e.target.value) })}
      />

      <div className="pt-2 border-t border-border-main">
        <Switch
          label={t('settings.smartSkip')}
          checked={config.smart_skip ?? defaultConfig.smart_skip ?? false}
          onChange={(val) => setConfig({ smart_skip: val })}
        />
      </div>
    </div>
  );
};
