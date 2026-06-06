import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getSupabaseAnonKey, getSupabaseUrl } from './supabaseEnv';

let _client: SupabaseClient | null = null;

function initClient(): SupabaseClient {
  if (_client) return _client;

  const url = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY ' +
        '(or SUPABASE_URL / SUPABASE_ANON_KEY) in Cloudflare environment variables.',
    );
  }

  _client = createClient(url, anonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
  return _client;
}

/** Lazy client — reads window.__KEKE_ENV__ on first use, not at module load. */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = initClient();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});
