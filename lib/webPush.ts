/**
 * Browser push for the web build.
 *
 * Companies use kekemanager.com rather than the app, and the browser's plain
 * `Notification` only fires while the tab is open — which is no use for a
 * booking that lands while the operator is in a meeting. This registers a
 * service worker and a real push subscription, so the same notifications the
 * app receives also arrive when the site is closed.
 *
 * Everything here is a no-op off the web, and every failure is silent: a
 * browser that cannot or will not do push must never break signing in.
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';

const SW_PATH = '/sw.js';

function supported(): boolean {
  return (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'
  );
}

function b64urlToUint8(base64Url: string): Uint8Array {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/') +
    '==='.slice((base64Url.length + 3) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function keyToB64url(key: ArrayBuffer | null): string {
  if (!key) return '';
  const bytes = new Uint8Array(key);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke('web-push/key', { body: {} });
    if (error) return null;
    const key = (data as { publicKey?: string } | null)?.publicKey;
    return key && key.length > 20 ? key : null;
  } catch {
    return null;
  }
}

/**
 * Asks for permission, subscribes this browser and tells the server about it.
 *
 * Returns the state rather than throwing, so the caller can decide whether it
 * is worth saying anything to the person.
 */
export async function enableWebPush(): Promise<
  'enabled' | 'denied' | 'unsupported' | 'failed'
> {
  if (!supported()) return 'unsupported';

  try {
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission !== 'granted') {
      const asked = await Notification.requestPermission();
      if (asked !== 'granted') return 'denied';
    }

    const registration = await navigator.serviceWorker.register(SW_PATH);
    await navigator.serviceWorker.ready;

    const publicKey = await fetchPublicKey();
    if (!publicKey) return 'failed';

    // A subscription made against a different key can never be decrypted, so
    // an existing one is reused only when its key still matches.
    let sub = await registration.pushManager.getSubscription();
    if (sub) {
      const current = keyToB64url(sub.options?.applicationServerKey ?? null);
      if (current && current !== publicKey) {
        await sub.unsubscribe().catch(() => undefined);
        sub = null;
      }
    }

    if (!sub) {
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64urlToUint8(publicKey) as unknown as BufferSource,
      });
    }

    const raw = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return 'failed';

    const { error } = await supabase.functions.invoke('web-push/subscribe', {
      body: { endpoint: raw.endpoint, keys: raw.keys },
    });
    if (error) return 'failed';

    return 'enabled';
  } catch {
    return 'failed';
  }
}

/** Stops this browser receiving notifications, both sides. */
export async function disableWebPush(): Promise<void> {
  if (!supported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const sub = await registration?.pushManager.getSubscription();
    if (!sub) return;
    const endpoint = sub.endpoint;
    await sub.unsubscribe().catch(() => undefined);
    await supabase.functions.invoke('web-push/unsubscribe', { body: { endpoint } });
  } catch {
    // nothing to do; the server drops dead subscriptions on its own
  }
}

/**
 * Re-registers quietly on every load for someone who has already said yes.
 *
 * Subscriptions expire and browsers rotate them, so without this a company that
 * allowed notifications in September would simply stop hearing from us one day,
 * with nothing to show that anything had changed.
 */
export async function refreshWebPushSilently(): Promise<void> {
  if (!supported()) return;
  if (Notification.permission !== 'granted') return;
  await enableWebPush();
}
