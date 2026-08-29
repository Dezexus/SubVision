import { useLocaleStore } from '../store/localeStore';
import { en } from './locales/en';
import { ru } from './locales/ru';

const dictionaries = { en, ru } as const;

type Dict = typeof en;

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? ''));
}

export function useTranslation() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const dict = dictionaries[locale] as Dict;

  const t = (key: string, vars?: Record<string, string | number>): string => {
    const value = getByPath(dict as unknown as Record<string, unknown>, key);
    if (typeof value === 'string') return interpolate(value, vars);
    return key;
  };

  const field = (sectionKey: string, fieldKey: string) => {
    const composite = `${sectionKey}.${fieldKey}`;
    const entry = (dict.emotion.field as Record<string, { label: string; help?: string }>)[composite];
    return {
      label: entry?.label ?? composite,
      help: entry?.help ?? '',
    };
  };

  const option = (value: string) => t(`emotion.option.${value}`);

  return { t, field, option, locale, setLocale };
}
