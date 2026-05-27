import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { BlogLang } from './blogTypes';
import { isSeoLang } from './seoMeta';

function parseLangParam(raw: string | string[] | undefined): BlogLang | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  return isSeoLang(value) ? value : null;
}

function readWebSearchLang(): BlogLang | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('lang');
  return q && isSeoLang(q) ? q : null;
}

/** Resolves ?lang= from route params; on web also reads window.location.search (static export). */
export function useBlogLang(): BlogLang {
  const params = useLocalSearchParams<{ lang?: string | string[] }>();
  const [webLang, setWebLang] = useState<BlogLang | null>(() => readWebSearchLang());

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const sync = () => setWebLang(readWebSearchLang());
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  return useMemo(() => {
    return parseLangParam(params.lang) ?? webLang ?? 'ka';
  }, [params.lang, webLang]);
}
