import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { TRANSLATIONS, type LanguageCode, type TranslationDict } from './translations';

/**
 * Lightweight i18n: a React context holding the active language plus a `t()`
 * helper that interpolates `{placeholders}` from the dictionary. The choice is
 * persisted to localStorage so a demo refresh keeps the judge's language.
 */

const STORAGE_KEY = 'paytm-clarity-lang';

interface I18nContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  dict: TranslationDict;
  /** Interpolate `{placeholders}` in a dictionary string. */
  format: (template: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function loadLanguage(): LanguageCode {
  if (typeof window === 'undefined') return 'en';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'hi' || stored === 'kn' || stored === 'en' ? stored : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(loadLanguage);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch {
      /* storage blocked — the in-memory choice still works */
    }
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: LanguageCode) => setLanguageState(next), []);

  const format = useCallback(
    (template: string, params?: Record<string, string | number>) => {
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in params ? String(params[key]) : match
      );
    },
    []
  );

  const value = useMemo(
    () => ({ language, setLanguage, dict: TRANSLATIONS[language], format }),
    [language, setLanguage, format]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// Colocated with the provider for the same reason as `useApp` in AppContext.
// eslint-disable-next-line react/only-export-components
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
