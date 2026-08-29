import React from 'react';
import { Languages } from 'lucide-react';
import { cn } from '../shared/lib';
import { useTranslation } from '../i18n';
import type { Locale } from '../store/localeStore';

interface Props {
  className?: string;
}

export const LanguageSwitcher: React.FC<Props> = ({ className }) => {
  const { locale, setLocale, t } = useTranslation();

  const btn = (code: Locale) => (
    <button
      key={code}
      type="button"
      onClick={() => setLocale(code)}
      className={cn(
        'px-2 py-0.5 rounded text-[11px] font-bold tracking-wide transition-colors',
        locale === code
          ? 'bg-brand-500/20 text-brand-400'
          : 'text-txt-muted hover:text-txt-main',
      )}
    >
      {t(`lang.${code}`)}
    </button>
  );

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Languages size={14} className="text-txt-muted" />
      {btn('ru')}
      <span className="text-txt-subtle text-[10px]">/</span>
      {btn('en')}
    </div>
  );
};
