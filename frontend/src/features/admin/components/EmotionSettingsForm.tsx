import React from 'react';
import { Slider, Switch } from '../../../shared/ui';
import { useTranslation } from '../../../i18n';
import type { EmotionAnalysisSettings } from '../../../types/emotion';
import { EMOTION_SETTINGS_META, type SettingFieldMeta } from '../emotionSettingsMeta';

type Section = SettingFieldMeta['section'];

interface Props {
  settings: EmotionAnalysisSettings;
  onChange: (section: Section, key: string, value: boolean | number | string) => void;
  sections?: Section[];
  variant?: 'admin' | 'export';
  quickOnly?: boolean;
  /** Skip quick-toggle fields on the export Quick tab (export section only). */
  excludeQuick?: boolean;
  /** Hide admin-only fields (export dialog). */
  hideAdminOnly?: boolean;
  /** Show only admin-only fields (admin advanced collapsible). */
  adminOnlyFields?: boolean;
  /** Let parent handle scroll — no inner max-height. */
  compact?: boolean;
}

function getSectionValue(settings: EmotionAnalysisSettings, section: Section): Record<string, unknown> {
  return settings[section] as unknown as Record<string, unknown>;
}

const SECTION_ORDER: Section[] = ['export', 'diarization', 'gender', 'text_sentiment', 'json_format'];

export const EmotionSettingsForm: React.FC<Props> = ({
  settings,
  onChange,
  sections = SECTION_ORDER,
  variant = 'export',
  quickOnly = false,
  excludeQuick = false,
  hideAdminOnly = false,
  adminOnlyFields = false,
  compact = false,
}) => {
  const { t, field, option } = useTranslation();
  const isAdmin = variant === 'admin';

  const fields = EMOTION_SETTINGS_META.filter((f) => {
    if (!sections.includes(f.section)) return false;
    if (adminOnlyFields && !f.adminOnly) return false;
    if (!adminOnlyFields && hideAdminOnly && f.adminOnly && !isAdmin) return false;
    if (quickOnly && !f.quick) return false;
    if (excludeQuick && f.quick) return false;
    return true;
  });

  const grouped = SECTION_ORDER.filter((s) => sections.includes(s)).map((section) => ({
    section,
    fields: fields.filter((f) => f.section === section),
  })).filter((g) => g.fields.length > 0);

  const renderField = (f: SettingFieldMeta) => {
    const value = getSectionValue(settings, f.section)[f.key];
    const { label, help } = field(f.section, f.key);
    const id = `${f.section}.${f.key}`;

    if (f.type === 'boolean') {
      return (
        <div key={id} className="space-y-0.5">
          <Switch label={label} checked={Boolean(value)} onChange={(v) => onChange(f.section, f.key, v)} />
          {help && <p className="text-[11px] text-txt-subtle pl-0.5 -mt-1">{help}</p>}
        </div>
      );
    }
    if (f.type === 'select' && f.options) {
      return (
        <label key={id} className="block space-y-1">
          <span className="text-xs font-bold uppercase tracking-wide text-txt-muted">{label}</span>
          {help && <p className="text-[11px] text-txt-subtle -mt-0.5 mb-1">{help}</p>}
          <select
            value={String(value)}
            onChange={(e) => onChange(f.section, f.key, e.target.value)}
            className="w-full bg-bg-input border border-border-strong rounded-md text-sm px-3 py-2"
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>{option(o.value)}</option>
            ))}
          </select>
        </label>
      );
    }
    if (f.type === 'number') {
      return (
        <div key={id} className="space-y-0.5">
          <Slider
            label={label}
            min={f.min ?? 0}
            max={f.max ?? 100}
            step={f.step ?? 1}
            value={Number(value)}
            valueDisplay={String(value)}
            onChange={(e) => onChange(f.section, f.key, Number(e.target.value))}
          />
          {help && <p className="text-[11px] text-txt-subtle">{help}</p>}
        </div>
      );
    }
    return (
      <label key={id} className="block space-y-1">
        <span className="text-xs font-bold uppercase tracking-wide text-txt-muted">{label}</span>
        {help && <p className="text-[11px] text-txt-subtle -mt-0.5 mb-1">{help}</p>}
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(f.section, f.key, e.target.value)}
          className="w-full bg-bg-input border border-border-strong rounded-md text-sm px-3 py-2"
        />
      </label>
    );
  };

  if (quickOnly) {
    return (
      <div className="space-y-3">
        {fields.map(renderField)}
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4 max-h-[60vh] overflow-y-auto pr-1 scrollbar-hide'}>
      {grouped.map(({ section, fields: sectionFields }) => (
        <div
          key={section}
          className={compact
            ? 'bg-bg-surface/50 border border-border-main rounded-lg p-3 space-y-2.5'
            : 'bg-bg-panel border border-border-main rounded-xl p-4 space-y-3'}
        >
          <h3 className="text-xs font-bold uppercase tracking-wider text-brand-400">
            {t(`emotion.section.${section}`)}
          </h3>
          {sectionFields.map(renderField)}
        </div>
      ))}
    </div>
  );
};
