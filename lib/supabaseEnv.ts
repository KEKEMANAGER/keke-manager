import Constants from 'expo-constants';
import { Platform } from 'react-native';

declare global {
  // Injected by scripts/patch-web-html.mjs during production build.
  interface Window {
    __KEKE_ENV__?: {
      EXPO_PUBLIC_SUPABASE_URL?: string;
      EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    };
  }
}

function pick(...values: (string | undefined | null)[]): string {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return '';
}

function runtimeEnv() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  return window.__KEKE_ENV__;
}

function configExtra(): { supabaseUrl?: string; supabaseAnonKey?: string } {
  return (Constants.expoConfig?.extra ?? {}) as {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
  };
}

/** Resolves Supabase URL from inlined env, app config extra, or runtime HTML inject. */
export function getSupabaseUrl(): string {
  const extra = configExtra();
  const runtime = runtimeEnv();
  return pick(
    process.env.EXPO_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
    extra.supabaseUrl,
    runtime?.EXPO_PUBLIC_SUPABASE_URL,
  );
}

/** Resolves Supabase anon key from inlined env, app config extra, or runtime HTML inject. */
export function getSupabaseAnonKey(): string {
  const extra = configExtra();
  const runtime = runtimeEnv();
  return pick(
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_ANON_KEY,
    extra.supabaseAnonKey,
    runtime?.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function assertSupabaseEnv(): { url: string; anonKey: string } {
  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
        '(or SUPABASE_URL / SUPABASE_ANON_KEY) in Cloudflare Build environment variables.',
    );
  }
  return { url, anonKey };
}
