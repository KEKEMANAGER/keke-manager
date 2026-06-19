import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import {
  isLandingLangCode,
  LANDING_LANGUAGES,
  type LandingLangCode,
} from './landingLanguages';

const LANDING_LANG_STORAGE_KEY = '@keke/landing-lang';

export function parseLandingLang(raw: string | null | undefined): LandingLangCode | null {
  const code = raw?.trim().toLowerCase();
  if (!code || !isLandingLangCode(code)) return null;
  return code;
}

function readWebLandingLang(): LandingLangCode | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return parseLandingLang(new URLSearchParams(window.location.search).get('lang'));
}

async function readStoredLandingLang(): Promise<LandingLangCode | null> {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const stored = await AsyncStorage.getItem(LANDING_LANG_STORAGE_KEY);
    return parseLandingLang(stored);
  } catch {
    return null;
  }
}

export async function persistLandingLang(code: LandingLangCode): Promise<void> {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(LANDING_LANG_STORAGE_KEY, code);
  } catch {
    /* ignore */
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const url = new URL(window.location.href);
    if (code === 'ka') url.searchParams.delete('lang');
    else url.searchParams.set('lang', code);
    window.history.replaceState({}, '', url.toString());
    document.documentElement.lang = code;
    document.documentElement.dir = code === 'ar' || code === 'he' ? 'rtl' : 'ltr';
  }
}

/** Resolves landing/blog language from ?lang=, storage, or default ka. */
export function useLandingLang(): LandingLangCode {
  const params = useLocalSearchParams<{ lang?: string | string[] }>();
  const [storedLang, setStoredLang] = useState<LandingLangCode | null>(null);
  const [webLang, setWebLang] = useState<LandingLangCode | null>(() => readWebLandingLang());

  useEffect(() => {
    void readStoredLandingLang().then(setStoredLang);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const sync = () => setWebLang(readWebLandingLang());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return useMemo(() => {
    const raw = Array.isArray(params.lang) ? params.lang[0] : params.lang;
    return parseLandingLang(raw) ?? webLang ?? storedLang ?? 'ka';
  }, [params.lang, webLang, storedLang]);
}

export function useSetLandingLang(): (code: LandingLangCode) => void {
  return useCallback((code: LandingLangCode) => {
    void persistLandingLang(code);
  }, []);
}

export const LANDING_LANG_CODES = LANDING_LANGUAGES.map((l) => l.code);
