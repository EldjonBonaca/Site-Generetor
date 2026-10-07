/**
 * Minimal gettext-style i18n.
 * UI strings are written in English and wrapped in t('...'). To add a language,
 * create locales/<code>.js exporting { 'English string': 'Translation' } and
 * register it in LOCALES below. Missing strings fall back to English.
 * Interpolation: t('Hello {name}', { name: 'Ann' }).
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import it from './locales/it.js';

export const LOCALES = {
  en: { label: 'English', messages: {} },
  it: { label: 'Italiano', messages: it },
};

const I18nContext = createContext(null);

function readStoredLocale() {
  try {
    const v = localStorage.getItem('esg.locale');
    return v && LOCALES[v] ? v : 'en';
  } catch {
    return 'en';
  }
}

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(readStoredLocale);

  const setLocale = useCallback((code) => {
    setLocaleState(code);
    try {
      localStorage.setItem('esg.locale', code);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = code;
  }, []);

  const t = useCallback(
    (str, vars) => {
      const msg = LOCALES[locale]?.messages[str] ?? str;
      return vars ? msg.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : msg;
    },
    [locale]
  );

  const value = useMemo(() => ({ t, locale, setLocale }), [t, locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}
