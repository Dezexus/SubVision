import { create } from 'zustand';

export type Locale = 'ru' | 'en';

const STORAGE_KEY = 'subvision_locale';

function loadLocale(): Locale {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'ru' || raw === 'en') return raw;
  } catch {
    /* ignore */
  }
  return 'ru';
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: loadLocale(),
  setLocale: (locale) => {
    localStorage.setItem(STORAGE_KEY, locale);
    set({ locale });
  },
}));
