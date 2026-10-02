/**
 * Price requests, answered by a human from Telegram.
 *
 * A formula cannot price Georgian tour transport: the number depends on the
 * operator, the season, the relationship and what was agreed last time. So the
 * company describes the job, it lands in KEKE's Telegram, and an answer comes
 * back within minutes — to the company's screen and as a notification, not as
 * a message in some other app they have to go and find.
 *
 * One function, two doors:
 *   POST /price-quote          (signed in)  — create a request, send it to Telegram
 *   POST /price-quote/hook     (Telegram)   — the reply comes back
 *
 * Secrets, set in the project's Edge Function settings:
 *   TELEGRAM_BOT_TOKEN   from @BotFather
 *   TELEGRAM_CHAT_ID     the chat the requests are sent to
 *   TELEGRAM_HOOK_SECRET a random string; Telegram echoes it on every webhook
 *                        call, and a call without it is ignored.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

const KINDS = new Set(['transfer', 'day_tour', 'tour']);

function clean(v: unknown, max = 300): string | null {
  const s = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return s ? s.slice(0, max) : null;
}

function int(v: unknown, min: number, max: number): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

const KIND_KA: Record<string, string> = {
  transfer: 'ტრანსფერი',
  day_tour: 'დღიური ტური',
  tour: 'ტური',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendTelegram(
  token: string,
  chatId: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 200) };
  }
}

/**
 * Two of the three secrets this used to need were busywork: the chat id is
 * simply whatever chat says /start to the bot, and the webhook secret is a
 * random string whose only job is to prove a call came from Telegram. Both are
 * worked out here and kept in `app_settings`, so the only thing a person has to
 * supply is the bot token.
 */
const settingsCache = new Map<string, string>();

async function getSetting(key: string): Promise<string | null> {
  const cached = settingsCache.get(key);
  if (cached) return cached;
  const { data } = await admin().from('app_settings').select('value').eq('key', key).maybeSingle();
  const value = (data as { value?: string } | null)?.value ?? null;
  if (value) settingsCache.set(key, value);
  return value;
}

async function setSetting(key: string, value: string): Promise<void> {
  settingsCache.set(key, value);
  await admin()
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

/** The env var wins when it is set, so an explicit choice still overrides. */
async function hookSecret(): Promise<string> {
  const fromEnv = Deno.env.get('TELEGRAM_HOOK_SECRET');
  if (fromEnv) return fromEnv;

  const stored = await getSetting('telegram_hook_secret');
  if (stored) return stored;

  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const generated = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  await setSetting('telegram_hook_secret', generated);
  return generated;
}

async function telegramChatId(): Promise<string | null> {
  return Deno.env.get('TELEGRAM_CHAT_ID') ?? (await getSetting('telegram_chat_id'));
}

/**
 * Telegram allows one webhook per bot and setting it is idempotent, so the
 * function points Telegram at itself the first time it starts. That keeps the
 * bot token in exactly one place — the project's secrets — instead of also
 * having to be pasted into a browser to call setWebhook by hand.
 */
let webhookEnsured = false;

async function ensureWebhook(selfUrl: string): Promise<void> {
  if (webhookEnsured) return;
  webhookEnsured = true;

  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) {
    webhookEnsured = false; // the token may arrive later; try again next time
    return;
  }

  try {
    const secret = await hookSecret();
    await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: `${selfUrl}/hook`,
        secret_token: secret,
        allowed_updates: ['message', 'edited_message'],
      }),
    });
  } catch {
    webhookEnsured = false;
  }
}

function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

// ─── the company asks ───────────────────────────────────────────────────────

async function createRequest(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ ok: false, error: 'ავტორიზაცია საჭიროა' }, 401);
  }

  const db = admin();
  const { data: userRes, error: userErr } = await db.auth.getUser(authHeader.replace('Bearer ', ''));
  const user = userRes?.user;
  if (userErr || !user) {
    return json({ ok: false, error: 'ავტორიზაცია ვერ დადასტურდა' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'არასწორი მოთხოვნა' }, 400);
  }

  const kindRaw = clean(body.kind, 20) ?? 'transfer';
  const kind = KINDS.has(kindRaw) ? kindRaw : 'transfer';
  const from = clean(body.from_location);
  const to = clean(body.to_location);
  const whenText = clean(body.when_text, 120);
  const note = clean(body.note, 1000);

  if (!from && !note) {
    return json({ ok: false, error: 'მიუთითე მარშრუტი ან აღწერა' }, 400);
  }

  // One open request a minute is plenty for a person filling in a form; more
  // than that is a stuck button or a script, and either way Telegram should not
  // be the place it shows up.
  const { count } = await db
    .from('price_requests')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', user.id)
    .gt('created_at', new Date(Date.now() - 60_000).toISOString());
  if ((count ?? 0) >= 3) {
    return json({ ok: false, error: 'ძალიან ბევრი მოთხოვნა — დაელოდე ერთ წუთს' }, 429);
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const companyName =
    clean(meta.companyName, 120) ?? clean(meta.full_name, 120) ?? user.email ?? null;

  const { data, error } = await db
    .from('price_requests')
    .insert({
      company_id: user.id,
      company_name: companyName,
      kind,
      from_location: from,
      to_location: to,
      when_text: whenText,
      days: int(body.days, 1, 60),
      passengers: int(body.passengers, 1, 80),
      vehicle_type: clean(body.vehicle_type, 30),
      vehicle_class: clean(body.vehicle_class, 30),
      note,
    })
    .select('id')
    .single();

  if (error || !data) {
    return json({ ok: false, error: error?.message ?? 'ვერ შეინახა' }, 500);
  }

  const id = data.id as number;
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const chatId = await telegramChatId();

  if (!token || !chatId) {
    // The request is saved either way — it is visible on the company's screen
    // and answerable later. Only the instant ping is missing.
    return json({ ok: true, id, delivered: false });
  }

  const lines = [
    `<b>ფასის მოთხოვნა #${id}</b>`,
    companyName ? `🏢 ${escapeHtml(companyName)}` : null,
    `🚩 ${KIND_KA[kind] ?? kind}`,
    from || to ? `📍 ${escapeHtml([from, to].filter(Boolean).join(' → '))}` : null,
    whenText ? `📅 ${escapeHtml(whenText)}` : null,
    body.days ? `🗓 ${int(body.days, 1, 60)} დღე` : null,
    body.passengers ? `👥 ${int(body.passengers, 1, 80)} მგზავრი` : null,
    clean(body.vehicle_type, 30) ? `🚐 ${escapeHtml(clean(body.vehicle_type, 30)!)}` : null,
    note ? `📝 ${escapeHtml(note)}` : null,
    '',
    `პასუხი: <code>/q ${id} 850</code>  (ან <code>/q ${id} 850 კომენტარი</code>)`,
  ].filter(Boolean);

  const sent = await sendTelegram(token, chatId, lines.join('\n'));
  return json({ ok: true, id, delivered: sent.ok });
}

// ─── the answer comes back ──────────────────────────────────────────────────

async function handleHook(req: Request): Promise<Response> {
  const expected = await hookSecret();
  const got = req.headers.get('x-telegram-bot-api-secret-token');
  if (!expected || got !== expected) {
    // Anyone can find the URL; only Telegram knows the secret. Answer 200 so a
    // prober learns nothing from the status code.
    return new Response('ok');
  }

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return new Response('ok');
  }

  const message = update.message ?? update.edited_message;
  const text: string = String(message?.text ?? '').trim();
  const chatId = message?.chat?.id;
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';

  const reply = (t: string) => (chatId && token ? sendTelegram(token, String(chatId), t) : null);

  // The first chat to talk to the bot becomes the chat requests are sent to.
  // That is what /start is for, and it saves a person hunting for their own id.
  if (chatId && !Deno.env.get('TELEGRAM_CHAT_ID')) {
    const known = await getSetting('telegram_chat_id');
    if (!known) {
      await setSetting('telegram_chat_id', String(chatId));
      await reply(
        '✅ KEKE ფასები მიბმულია.\n\nფასის მოთხოვნები აქ მოვა. პასუხი: <code>/q 7 850</code>',
      );
      return new Response('ok');
    }
  }

  // /q <id> <price> [note]
  const m = /^\/q(?:@\w+)?\s+(\d+)\s+([\d.,]+)\s*(.*)$/s.exec(text);
  if (!m) {
    if (text.startsWith('/q')) {
      await reply('ფორმატი: <code>/q 7 850</code>');
    }
    return new Response('ok');
  }

  const id = Number(m[1]);
  const price = Number(m[2].replace(',', '.'));
  const note = m[3]?.trim() ? m[3].trim().slice(0, 500) : null;

  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000) {
    await reply('ფასი არ გამოიყურება სწორად.');
    return new Response('ok');
  }

  const db = admin();
  const { data: row } = await db
    .from('price_requests')
    .select('id, company_id, from_location, to_location, status')
    .eq('id', id)
    .maybeSingle();

  if (!row) {
    await reply(`#${id} ვერ ვიპოვე.`);
    return new Response('ok');
  }

  const { error: updErr } = await db
    .from('price_requests')
    .update({
      status: 'quoted',
      quoted_price_gel: price,
      quoted_note: note,
      quoted_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (updErr) {
    await reply(`#${id} ვერ შევინახე: ${updErr.message.slice(0, 120)}`);
    return new Response('ok');
  }

  const route = [row.from_location, row.to_location].filter(Boolean).join(' → ');
  const body = [`${price.toLocaleString('ka-GE')} ₾`, route || null, note].filter(Boolean).join(' · ');

  await db.rpc('booking_notify', {
    p_user_id: row.company_id,
    p_title: 'KEKE · ფასი მზადაა',
    p_body: body,
    p_type: 'price_quote',
    p_data: { type: 'price_quote', request_id: String(id) },
  });

  await reply(`✅ #${id} — ${price.toLocaleString('ka-GE')} ₾ გაიგზავნა.`);
  return new Response('ok');
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Any call at all — even one that is about to be refused — is enough to make
  // sure Telegram knows where to deliver replies. That way the bot can be wired
  // up by adding the secrets and poking the function once, with the token never
  // leaving the project's settings.
  if (!url.pathname.endsWith('/hook')) {
    void ensureWebhook(`${url.origin}/functions/v1/price-quote`);
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  if (url.pathname.endsWith('/hook')) return handleHook(req);

  return createRequest(req);
});
