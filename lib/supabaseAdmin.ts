import Constants from 'expo-constants';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;

/**
 * Service role key from .env (wired via app.config.js `extra`) or EXPO_PUBLIC_* fallback.
 * Never commit the real key. Admin-only operations (e.g. delete auth user).
 */
export function resolveSupabaseServiceRoleKey(): string {
  const extra = Constants.expoConfig?.extra as { supabaseServiceRoleKey?: string } | undefined;
  return (
    extra?.supabaseServiceRoleKey?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ''
  );
}

let adminClient: SupabaseClient | null = null;
let adminClientKey: string | null = null;

/** Supabase client with service_role — Auth Admin API, bypasses RLS. */
export function getSupabaseAdmin(): SupabaseClient | null {
  const key = resolveSupabaseServiceRoleKey();
  if (!key) return null;
  if (adminClient && adminClientKey === key) return adminClient;
  adminClient = createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  adminClientKey = key;
  return adminClient;
}
