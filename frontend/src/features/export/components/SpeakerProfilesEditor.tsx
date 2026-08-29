import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../../shared/lib';
import { useTranslation } from '../../../i18n';
import type { SpeakerGender, SpeakerProfileOverride } from '../../../types/emotion';

const GENDERS: SpeakerGender[] = ['male', 'female', 'unknown'];
const DEFAULT_VISIBLE = 4;

interface Props {
  maxSpeakers: number;
  overrides: Record<string, SpeakerProfileOverride>;
  onChange: (speakerId: string, patch: Partial<SpeakerProfileOverride> | null) => void;
  compact?: boolean;
}

export const SpeakerProfilesEditor: React.FC<Props> = ({
  maxSpeakers,
  overrides,
  onChange,
  compact = false,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const total = Math.min(Math.max(maxSpeakers, 1), 10);
  const visibleCount = expanded ? total : Math.min(DEFAULT_VISIBLE, total);
  const rows = Array.from({ length: visibleCount }, (_, i) => `SPEAKER_${String(i).padStart(2, '0')}`);

  return (
    <div className={cn(
      'border border-border-main rounded-lg bg-bg-surface/50',
      compact ? 'p-3 space-y-2' : 'p-3 space-y-2',
    )}>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-brand-400">{t('emotion.speakerProfiles')}</h3>
        <p className="text-[11px] text-txt-subtle mt-0.5">{t('emotion.speakerProfilesHelp')}</p>
      </div>
      <div className="space-y-2">
        {rows.map((id) => {
          const row = overrides[id] ?? {};
          return (
            <div key={id} className="grid grid-cols-1 sm:grid-cols-[4.5rem_1fr_1fr] gap-1.5 items-center">
              <span className="text-[10px] font-mono text-txt-muted truncate">{id}</span>
              <select
                value={row.gender ?? ''}
                onChange={(e) => {
                  const v = e.target.value as SpeakerGender | '';
                  const next = { ...row };
                  if (v) next.gender = v;
                  else delete next.gender;
                  const empty = !next.gender && !next.suggested_role?.trim();
                  onChange(id, empty ? null : next);
                }}
                className="min-w-0 bg-bg-input border border-border-strong rounded-md text-[11px] px-1.5 py-1"
              >
                <option value="">{t('emotion.genderAuto')}</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>{t(`emotion.gender.${g}`)}</option>
                ))}
              </select>
              <input
                type="text"
                value={row.suggested_role ?? ''}
                placeholder={t('emotion.suggestedRolePlaceholder')}
                onChange={(e) => {
                  const role = e.target.value;
                  const next = { ...row };
                  if (role.trim()) next.suggested_role = role;
                  else delete next.suggested_role;
                  const empty = !next.gender && !next.suggested_role?.trim();
                  onChange(id, empty ? null : next);
                }}
                className="min-w-0 bg-bg-input border border-border-strong rounded-md text-[11px] px-1.5 py-1"
              />
            </div>
          );
        })}
      </div>
      {total > DEFAULT_VISIBLE && (
        <button
          type="button"
          className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown size={12} className={cn('transition-transform', expanded && 'rotate-180')} />
          {expanded ? t('emotion.hideSpeakers') : t('emotion.showMoreSpeakers', { count: total - DEFAULT_VISIBLE })}
        </button>
      )}
    </div>
  );
};

/** @deprecated Use SpeakerProfilesEditor */
export { SpeakerProfilesEditor as SpeakerGenderOverrides };
