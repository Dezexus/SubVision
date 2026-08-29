import React from 'react';
import { cn } from '../../../shared/lib';
import { useTranslation } from '../../../i18n';

export type AdminTab = 'system' | 'emotion' | 'speakers' | 'json' | 'jobs';

interface Props {
  active: AdminTab;
  onChange: (tab: AdminTab) => void;
}

const TABS: AdminTab[] = ['system', 'emotion', 'speakers', 'json', 'jobs'];

export const AdminTabs: React.FC<Props> = ({ active, onChange }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1 border-b border-border-main pb-2">
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
            active === tab
              ? 'bg-brand-500/20 text-brand-400'
              : 'text-txt-muted hover:text-txt-main hover:bg-bg-hover',
          )}
        >
          {t(`admin.tabs.${tab}`)}
        </button>
      ))}
    </div>
  );
};
