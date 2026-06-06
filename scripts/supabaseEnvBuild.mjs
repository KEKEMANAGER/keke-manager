/** Shared Supabase env resolution for Cloudflare / Expo production builds. */

export const SUPABASE_URL_NAMES = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'VITE_SUPABASE_URL',
];

export const SUPABASE_ANON_KEY_NAMES = [
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_ANON_KEY',
  'SUPABASE_KEY',
  'EXPO_PUBLIC_SUPABASE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
];

export function firstEnv(names) {
  for (const name of names) {
    const val = process.env[name]?.trim();
    if (val) return val;
  }
  return '';
}

export function normalizeSupabaseBuildEnv() {
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) {
    const url = firstEnv(SUPABASE_URL_NAMES.slice(1));
    if (url) {
      process.env.EXPO_PUBLIC_SUPABASE_URL = url;
      console.log('supabase-env: mapped URL alias → EXPO_PUBLIC_SUPABASE_URL');
    }
  }

  if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    const key = firstEnv(SUPABASE_ANON_KEY_NAMES.slice(1));
    if (key) {
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = key;
      console.log('supabase-env: mapped anon key alias → EXPO_PUBLIC_SUPABASE_ANON_KEY');
    }
  }

  if (!process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) {
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
  }
  if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) {
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
  }

  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL.trim(),
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY.trim(),
  };
}

export function runtimeEnvScriptContent(url, anonKey) {
  if (!url || !anonKey) return '';
  return `window.__KEKE_ENV__=${JSON.stringify({
    EXPO_PUBLIC_SUPABASE_URL: url,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: anonKey,
  })};`;
}
