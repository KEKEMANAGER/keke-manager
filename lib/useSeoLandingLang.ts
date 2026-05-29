import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { pickLang, type SeoLandingLang } from './seoLandingPages';

function readWebLang(): SeoLandingLang | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('lang');
  return q === 'en' ? 'en' : q === 'ka' ? 'ka' : null;
}

export function useSeoLandingLang(): SeoLandingLang {
  const params = useLocalSearchParams<{ lang?: string | string[] }>();
  const [webLang, setWebLang] = useState<SeoLandingLang | null>(() => readWebLang());

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const sync = () => setWebLang(readWebLang());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return useMemo(() => {
    const raw = Array.isArray(params.lang) ? params.lang[0] : params.lang;
    return pickLang(raw ?? webLang ?? undefined);
  }, [params.lang, webLang]);
}
