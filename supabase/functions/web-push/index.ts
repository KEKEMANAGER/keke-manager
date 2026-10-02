/**
 * Browser notifications for KEKE Manager.
 *
 * Companies work from kekemanager.com rather than from the app, and not one of
 * them has an Expo push token — so until now a tour operator was told nothing at
 * all unless they happened to be looking at the tab. This delivers the same
 * notifications the app already sends, to the browser, whether or not the site
 * is open.
 *
 * Four doors:
 *   POST /web-push/key          → the VAPID public key the browser subscribes with
 *   POST /web-push/subscribe    (signed in) → remember this browser
 *   POST /web-push/unsubscribe  (signed in) → forget this browser
 *   POST /web-push/send         (from the database) → deliver to one user
 *
 * Nothing has to be pasted anywhere to set this up: the VAPID key pair and the
 * shared secret the database calls with are generated here on first use and
 * kept in `app_settings`, exactly like the Telegram bot's webhook secret.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { generateVapidKeys, sendWebPush, type VapidKeys } from './webpush.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const VAPID_SUBJECT = 'mailto:info@kekemanager.com';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

// ── settings, cached per isolate ────────────────────────────────────────────

const cache = new Map<string, string>();

async function getSetting(key: string): Promise<string | null> {
  const hit = cache.get(key);
  if (hit) return hit;
  const { data } = await admin().from('app_settings').select('value').eq('key', key).maybeSingle();
  const value = (data as { value?: string } | null)?.value ?? null;
  if (value) cache.set(key, value);
  return value;
}

async function setSetting(key: string, value: string): Promise<void> {
  cache.set(key, value);
  await admin()
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

function randomHex(bytes: number): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * The key pair is generated once and then never changes: every browser that has
 * already subscribed did so against the public half, and a new pair would make
 * every existing subscription undeliverable.
 */
async function vapidKeys(): Promise<VapidKeys> {
  const pub = await getSetting('vapid_public_key');
  const priv = await getSetting('vapid_private_key');
  if (pub && priv) return { publicKey: pub, privateKey: priv };

  const generated = await generateVapidKeys();
  await setSetting('vapid_public_key', generated.publicKey);
  await setSetting('vapid_private_key', generated.privateKey);
  return generated;
}

/** What the database needs in order to call /send, written where it can read it. */
async function ensureHookConfig(selfUrl: string): Promise<void> {
  const secret = await getSetting('web_push_hook_secret');
  if (!secret) await setSetting('web_push_hook_secret', randomHex(24));

  const url = await getSetting('web_push_url');
  if (url !== selfUrl) await setSetting('web_push_url', selfUrl);
}

// ── who is calling ──────────────────────────────────────────────────────────

async function signedInUserId(req: Request): Promise<string | null> {
  const header = req.headers.get('Authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const { data } = await admin().auth.getUser(header.slice('Bearer '.length));
  return data?.user?.id ?? null;
}

// ── routes ──────────────────────────────────────────────────────────────────

async function handleSubscribe(req: Request): Promise<Response> {
  const userId = await signedInUserId(req);
  if (!userId) return json({ ok: false, error: 'ავტორიზაცია საჭიროა' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'არასწორი მოთხოვნა' }, 400);
  }

  const endpoint = String(body?.endpoint ?? '').trim();
  const p256dh = String(body?.keys?.p256dh ?? '').trim();
  const auth = String(body?.keys?.auth ?? '').trim();
  if (!endpoint.startsWith('https://') || !p256dh || !auth) {
    return json({ ok: false, error: 'გამოწერა არასრულია' }, 400);
  }

  // The endpoint identifies the browser, so the same browser re-subscribing
  // updates its row — including moving it to whoever is signed in now, which is
  // what should happen on a shared computer.
  const { error } = await admin()
    .from('web_push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
        fail_count: 0,
      },
      { onConflict: 'endpoint' },
    );

  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
}

async function handleUnsubscribe(req: Request): Promise<Response> {
  const userId = await signedInUserId(req);
  if (!userId) return json({ ok: false, error: 'ავტორიზაცია საჭიროა' }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'არასწორი მოთხოვნა' }, 400);
  }
  const endpoint = String(body?.endpoint ?? '').trim();
  if (!endpoint) return json({ ok: false, error: 'endpoint არ არის' }, 400);

  await admin()
    .from('web_push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', userId);

  return json({ ok: true });
}

async function handleSend(req: Request): Promise<Response> {
  const secret = await getSetting('web_push_hook_secret');
  const got = req.headers.get('x-keke-push-secret');
  if (!secret || got !== secret) {
    // Only the database knows the secret. Answer 200 either way so a prober
    // learns nothing from the status code.
    return new Response('ok');
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('ok');
  }

  const userId = String(body?.user_id ?? '').trim();
  if (!userId) return new Response('ok');

  const db = admin();
  const { data: subs } = await db
    .from('web_push_subscriptions')
    .select('id, endpoint, p256dh, auth, fail_count')
    .eq('user_id', userId);

  if (!subs || subs.length === 0) return json({ ok: true, sent: 0 });

  const keys = await vapidKeys();
  const payload = JSON.stringify({
    title: String(body?.title ?? 'KEKE Manager').slice(0, 120),
    body: String(body?.body ?? '').slice(0, 300),
    data: body?.data ?? {},
  });

  let sent = 0;
  const dead: number[] = [];

  for (const sub of subs as any[]) {
    try {
      const res = await sendWebPush(
        sub.endpoint,
        { p256dh: sub.p256dh, auth: sub.auth },
        payload,
        keys,
        VAPID_SUBJECT,
      );
      if (res.gone) {
        dead.push(sub.id);
      } else if (res.status >= 200 && res.status < 300) {
        sent += 1;
        await db
          .from('web_push_subscriptions')
          .update({ last_ok_at: new Date().toISOString(), fail_count: 0 })
          .eq('id', sub.id);
      } else {
        await db
          .from('web_push_subscriptions')
          .update({ fail_count: (sub.fail_count ?? 0) + 1 })
          .eq('id', sub.id);
      }
    } catch {
      // one unreachable push service must not stop the others
    }
  }

  // A browser that has revoked its subscription says so with 404/410, and the
  // row is then worthless — keeping it would mean retrying it for ever.
  if (dead.length > 0) {
    await db.from('web_push_subscriptions').delete().in('id', dead);
  }

  return json({ ok: true, sent, removed: dead.length });
}

// ── serve ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const route = url.pathname.split('/').pop() ?? '';

  // Same reason as the Telegram function: TLS ends at the edge, so the request's
  // own origin reads as http inside the isolate.
  const base = (Deno.env.get('SUPABASE_URL') || url.origin)
    .replace(/^http:/, 'https:')
    .replace(/\/+$/, '');

  if (route !== 'send') {
    await ensureHookConfig(`${base}/functions/v1/web-push/send`);
  }

  if (route === 'key') {
    const keys = await vapidKeys();
    return json({ ok: true, publicKey: keys.publicKey });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);
  if (route === 'subscribe') return handleSubscribe(req);
  if (route === 'unsubscribe') return handleUnsubscribe(req);
  if (route === 'send') return handleSend(req);

  return json({ ok: false, error: 'unknown route' }, 404);
});
