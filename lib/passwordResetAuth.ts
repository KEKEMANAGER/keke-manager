import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const APP_SCHEME = 'kekemanager';

/**
 * Redirect URL for Supabase password recovery emails.
 * - Dev (Expo Go): exp://…/--/reset-password
 * - Standalone: kekemanager://reset-password
 */
export function getPasswordResetRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/reset-password`;
  }
  return Linking.createURL('reset-password');
}

/** Also register in Supabase Dashboard → Auth → URL Configuration → Redirect URLs. */
export function getPasswordResetRedirectAllowList(): string[] {
  return [
    `${APP_SCHEME}://reset-password`,
    `${APP_SCHEME}:///(auth)/reset-password`,
    getPasswordResetRedirectUrl(),
  ];
}

function collectUrlParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};

  const hashIdx = url.indexOf('#');
  if (hashIdx >= 0) {
    const hash = url.slice(hashIdx + 1);
    new URLSearchParams(hash).forEach((value, key) => {
      out[key] = value;
    });
  }

  const qIdx = url.indexOf('?');
  if (qIdx >= 0) {
    const end = hashIdx >= 0 ? hashIdx : url.length;
    const query = url.slice(qIdx + 1, end);
    new URLSearchParams(query).forEach((value, key) => {
      out[key] = value;
    });
  }

  const parsed = Linking.parse(url);
  const qp = parsed.queryParams;
  if (qp) {
    for (const [key, raw] of Object.entries(qp)) {
      if (typeof raw === 'string') out[key] = raw;
      else if (Array.isArray(raw) && typeof raw[0] === 'string') out[key] = raw[0];
    }
  }

  return out;
}

/** Establish a Supabase session from a recovery deep link or web callback URL. */
export async function createSessionFromAuthUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  const params = collectUrlParams(url);
  const errorDescription = params.error_description ?? params.error;
  if (errorDescription) {
    return { ok: false, error: decodeURIComponent(errorDescription.replace(/\+/g, ' ')) };
  }

  const code = params.code;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const access_token = params.access_token;
  const refresh_token = params.refresh_token;
  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  return { ok: false, error: 'missing_tokens' };
}

export function isPasswordRecoveryUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('reset-password') ||
    lower.includes('type=recovery') ||
    lower.includes('access_token=') ||
    lower.includes('code=')
  );
}
