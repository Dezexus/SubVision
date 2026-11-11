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

/** Resolve a translation key outside React (e.g. WebSocket handlers). */
export function translate(key: string, vars?: Record<string, string | number>): string {
  const locale = useLocaleStore.getState().locale;
  const dict = dictionaries[locale] as Dict;
  const value = getByPath(dict as unknown as Record<string, unknown>, key);
  if (typeof value === 'string') return interpolate(value, vars);
  return key;
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

  return { t, locale, setLocale };
}
