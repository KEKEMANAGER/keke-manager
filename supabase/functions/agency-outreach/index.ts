/**
 * Introduction letter to Georgian tour companies, sent from
 * info@kekemanager.com through Zoho Mail — one company at a time.
 *
 * Booking emails go through Resend; this letter must not: Resend forbids
 * sending to people who did not sign up, and breaking that would stop the
 * booking emails too.
 *
 * Doors (every call needs the x-keke-outreach-secret header):
 *   {action: "run"}            next company in the list, if the campaign is on
 *   {action: "test", to}       the same letter to one @kekemanager.com address
 *   {action: "status"}         how many are sent, waiting, skipped, failed
 *   {action: "preview"}        fingerprints of the letter, to check a deploy
 *
 * The cron (every few minutes, working hours) calls "run". A login refusal
 * switches the campaign off, so a wrong password is never retried all day.
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { renderOutreach } from './content.ts';
import { buildMessage, deliverSmtp, SmtpAuthError, type DeliveryResult } from './smtp.ts';

const CAMPAIGN = 'agencies-2026-10';
const FROM_ADDR = 'info@kekemanager.com';
const FROM_NAME = 'აკაკი ქაჩიბაია | KEKE Manager';
const PDF_URL = 'https://kekemanager.com/docs/KEKE-Manager-kompaniebistvis.pdf';
const PDF_NAME = 'KEKE-Manager-prezentacia.pdf';
const LOGO_URL = 'https://kekemanager.com/docs/keke-logo-email.png';
const SMTP_HOSTS = ['smtp.zoho.com', 'smtp.zoho.eu'];
const MAX_ATTEMPTS = 3;

type Recipient = {
  id: number;
  agency: string;
  emails: string[];
  attempts: number;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function admin(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });
}

async function setting(db: SupabaseClient, key: string): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data as { value?: string } | null)?.value ?? null;
}

async function setSetting(db: SupabaseClient, key: string, value: string): Promise<void> {
  await db.from('app_settings').upsert({ key, value, updated_at: new Date().toISOString() });
}

// ------------------------------------------------------------ the letter

let assetsPromise: Promise<{ pdf: Uint8Array; logo: Uint8Array }> | null = null;

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

function loadAssets(): Promise<{ pdf: Uint8Array; logo: Uint8Array }> {
  if (!assetsPromise) {
    assetsPromise = (async () => {
      const [pdf, logo] = await Promise.all([fetchBytes(PDF_URL), fetchBytes(LOGO_URL)]);
      // The site answers unknown paths with its own page; make sure these are the real files.
      if (dec(pdf.subarray(0, 5)) !== '%PDF-') throw new Error('presentation is not a PDF');
      if (logo[0] !== 0x89 || logo[1] !== 0x50) throw new Error('logo is not a PNG');
      return { pdf, logo };
    })().catch((e) => {
      assetsPromise = null;
      throw e;
    });
  }
  return assetsPromise;
}

function dec(u: Uint8Array): string {
  return new TextDecoder().decode(u);
}

async function letterFor(to: string[]): Promise<string> {
  const { pdf, logo } = await loadAssets();
  const { subject, html, text } = renderOutreach('cid:keke-logo');
  return buildMessage({ fromName: FROM_NAME, fromAddr: FROM_ADDR, to, subject, text, html, logo, pdf, pdfName: PDF_NAME });
}

// ------------------------------------------------------------ sending

let workingHost: string | null = null;

async function deliver(to: string[], message: string): Promise<DeliveryResult> {
  const pass = Deno.env.get('ZOHO_SMTP_PASSWORD');
  if (!pass) throw new SmtpAuthError('ZOHO_SMTP_PASSWORD is not set');
  // Zoho logs an account in on its own data centre only; the other one refuses.
  const hosts = workingHost ? [workingHost] : SMTP_HOSTS;
  let refused: unknown = null;
  for (const host of hosts) {
    try {
      const result = await deliverSmtp({ host, port: 465, user: FROM_ADDR, pass }, FROM_ADDR, to, message);
      workingHost = host;
      return result;
    } catch (e) {
      if (e instanceof SmtpAuthError && !workingHost) {
        refused = e;
        continue;
      }
      throw e;
    }
  }
  throw refused ?? new Error('no mail server answered');
}

function isTbilisiWorkingTime(now = new Date()): boolean {
  const t = new Date(now.getTime() + 4 * 3600 * 1000); // Tbilisi is UTC+4 all year
  const day = t.getUTCDay();
  const hour = t.getUTCHours();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 19;
}

async function runOne(db: SupabaseClient): Promise<Record<string, unknown>> {
  if ((await setting(db, 'outreach_enabled')) !== 'true') return { ok: true, idle: 'campaign off' };
  if (!isTbilisiWorkingTime()) return { ok: true, idle: 'outside working hours' };

  const { data: claimed, error: claimErr } = await db.rpc('claim_outreach_recipient', { p_campaign: CAMPAIGN });
  if (claimErr) return { ok: false, error: claimErr.message };
  const r = claimed as Recipient | null;
  if (!r || !r.id) return { ok: true, idle: 'nothing left' };

  const finish = async (status: string, note: string | null, sent = false) => {
    await db
      .from('outreach_recipients')
      .update({ status, note, sent_at: sent ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', r.id);
  };

  // Someone from this company may have joined KEKE since the list was made.
  const { data: isUser } = await db.rpc('outreach_is_existing_user', { p_emails: r.emails });
  if (isUser === true) {
    await finish('skipped', 'already on KEKE Manager');
    return { ok: true, id: r.id, skipped: 'already on KEKE Manager' };
  }

  try {
    const message = await letterFor(r.emails);
    const result = await deliver(r.emails, message);
    if (result.accepted.length === 0) {
      await finish('failed', `refused: ${result.rejected.map((x) => `${x.to} ${x.reply}`).join('; ')}`.slice(0, 900));
      return { ok: true, id: r.id, failed: 'all addresses refused' };
    }
    const note = result.rejected.length
      ? `refused: ${result.rejected.map((x) => `${x.to} ${x.reply}`).join('; ')}`.slice(0, 900)
      : null;
    await finish('sent', note, true);
    return { ok: true, id: r.id, sent: result.accepted.length, refused: result.rejected.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof SmtpAuthError) {
      // A refused login is not this company's fault: give the row back, stop the campaign.
      await db
        .from('outreach_recipients')
        .update({ status: 'pending', attempts: Math.max(0, r.attempts - 1), note: null, updated_at: new Date().toISOString() })
        .eq('id', r.id);
      await setSetting(db, 'outreach_enabled', 'false');
      await setSetting(db, 'outreach_last_error', `login refused: ${msg}`.slice(0, 500));
      return { ok: false, error: 'login refused, campaign switched off' };
    }
    const giveUp = r.attempts >= MAX_ATTEMPTS;
    await finish(giveUp ? 'failed' : 'pending', msg.slice(0, 900));
    return { ok: false, id: r.id, error: msg, retry: !giveUp };
  }
}

async function status(db: SupabaseClient): Promise<Record<string, unknown>> {
  const { data } = await db.from('outreach_recipients').select('status').eq('campaign', CAMPAIGN);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { status: string }[]) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return {
    ok: true,
    counts,
    enabled: (await setting(db, 'outreach_enabled')) === 'true',
    last_error: await setting(db, 'outreach_last_error'),
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const db = admin();
  const secret = await setting(db, 'outreach_hook_secret');
  if (!secret || req.headers.get('x-keke-outreach-secret') !== secret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    if (body.action === 'status') return json(await status(db));

    if (body.action === 'preview') {
      // Fingerprints of the letter as deployed, to compare with the approved text.
      const { subject, html, text } = renderOutreach('cid:keke-logo');
      const sha = async (s: string) =>
        Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      return json({ ok: true, subject, html_sha256: await sha(html), text_sha256: await sha(text) });
    }

    if (body.action === 'test') {
      const to = String(body.to ?? '').trim().toLowerCase();
      // Tests only ever reach our own mailboxes.
      if (!/^[a-z0-9._%+-]+@kekemanager\.com$/.test(to)) return json({ ok: false, error: 'test only to @kekemanager.com' }, 400);
      const message = await letterFor([to]);
      const result = await deliver([to], message);
      return json({ ok: result.accepted.length > 0, host: workingHost, ...result });
    }

    if (body.action === 'run') return json(await runOne(db));

    return json({ ok: false, error: 'unknown action' }, 400);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
