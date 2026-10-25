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

/**
 * Establish a Supabase session from a recovery deep link or web callback URL.
 * A link Supabase refused (already used, expired) comes back as
 * `link_invalid`, for the screen to explain in the user's language rather
 * than show Supabase's English text.
 */
export async function createSessionFromAuthUrl(url: string): Promise<{ ok: boolean; error?: string }> {
  const params = collectUrlParams(url);
  const errorDescription = params.error_description ?? params.error ?? params.error_code;
  if (errorDescription) {
    return { ok: false, error: 'link_invalid' };
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

/**
 * A recovery link as it comes back from Supabase: carrying the session
 * (tokens, or a PKCE code) or the reason it was refused. A bare
 * /reset-password address carries neither and is not a link to act on.
 */
export function hasRecoveryPayload(url: string): boolean {
  const params = collectUrlParams(url);
  const isRecovery = params.type === 'recovery' || url.toLowerCase().includes('reset-password');
  if (!isRecovery) return false;
  return Boolean(
    params.access_token || params.code || params.error || params.error_code || params.error_description,
  );
}

/** A recovery link that only says it was refused (already used, expired). */
export function isRecoveryErrorOnly(url: string): boolean {
  const params = collectUrlParams(url);
  if (params.access_token || params.code) return false;
  return Boolean(params.error || params.error_code || params.error_description);
}

// ---------------------------------------------------------------------------
// Catching the link before the reset screen exists
//
// A driver asks for the link in the app, switches to his mail and taps it, so
// the app is normally still open when the link comes back. The phone then
// hands the link over as a 'url' event. The router acts on that event by
// opening the reset screen — but the event has already fired by the time the
// screen mounts and starts listening, and getInitialURL() keeps returning
// whatever started the app. The link, and the one-time session in it, was
// lost: the screen only said "open the link from your email", and tapping
// the link again got "link expired" because it had been used up. No one who
// had the app open could set a password.
//
// So the link is caught here, from app start, and kept until the reset
// screen takes it.
// ---------------------------------------------------------------------------

let pendingRecoveryUrl: string | null = null;
const takenRecoveryUrls = new Set<string>();
const recoveryUrlWaiters = new Set<() => void>();
let captureStarted: Promise<void> | null = null;

function offerRecoveryUrl(url: string | null | undefined): void {
  if (!url || takenRecoveryUrls.has(url) || !hasRecoveryPayload(url)) return;
  pendingRecoveryUrl = url;
  recoveryUrlWaiters.forEach((notify) => notify());
}

/**
 * Start catching recovery links (called at app start; safe to call again).
 * Resolves once the URL that launched the app has been looked at.
 */
export function startRecoveryLinkCapture(): Promise<void> {
  if (captureStarted) return captureStarted;
  // Static web export renders without a window; nothing to catch there.
  if (Platform.OS === 'web' && typeof window === 'undefined') return Promise.resolve();
  Linking.addEventListener('url', ({ url }) => offerRecoveryUrl(url));
  captureStarted = Linking.getInitialURL().then(offerRecoveryUrl, () => undefined);
  return captureStarted;
}

/** The recovery link waiting to be used, if any. Each link is handed out once. */
export function takePendingRecoveryUrl(): string | null {
  const url = pendingRecoveryUrl;
  pendingRecoveryUrl = null;
  if (!url || takenRecoveryUrls.has(url)) return null;
  takenRecoveryUrls.add(url);
  return url;
}

/** Told whenever a new recovery link is waiting (one tapped while the reset screen is open). */
export function onPendingRecoveryUrl(notify: () => void): () => void {
  recoveryUrlWaiters.add(notify);
  return () => {
    recoveryUrlWaiters.delete(notify);
  };
}
