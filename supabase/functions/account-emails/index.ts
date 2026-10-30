/**
 * Emails about a person's account (not about a booking). Today one kind:
 * "company_welcome", sent to a tour company right after it registers.
 *
 * The database queues a row in account_emails when a company account is
 * created and wakes this function; a cron retries what failed.
 *
 * Doors (every call needs the x-keke-account-secret header):
 *   {}                       send what is queued
 *   {action: "test", to}     a sample welcome to one @kekemanager.com address
 *   {action: "preview"}      fingerprints of the sample, to check a deploy
 */
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { renderCompanyWelcome, type CompanyWelcomeInput } from './content.ts';

const FROM = 'KEKE Manager <noreply@kekemanager.com>';
const REPLY_TO = 'info@kekemanager.com';
const LOGO_URL = 'https://kekemanager.com/docs/keke-logo-email.png';
const LOGO_CID = 'keke-logo';
const BATCH = 10;
const STALE_MS = 2 * 24 * 60 * 60 * 1000;

type QueueRow = { id: number; user_id: string; kind: string; attempts: number; created_at: string };

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

let logoPromise: Promise<string> | null = null;

function logoBase64(): Promise<string> {
  if (!logoPromise) {
    logoPromise = (async () => {
      const res = await fetch(LOGO_URL);
      if (!res.ok) throw new Error(`logo ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes[0] !== 0x89 || bytes[1] !== 0x50) throw new Error('logo is not a PNG');
      return encodeBase64(bytes);
    })().catch((e) => {
      logoPromise = null;
      throw e;
    });
  }
  return logoPromise;
}

async function sendResend(
  key: string,
  idempotencyKey: string,
  to: string,
  mail: { subject: string; html: string; text: string },
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  try {
    const logo = await logoBase64();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: REPLY_TO,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        tags: [{ name: 'event', value: 'company_welcome' }],
        attachments: [{ filename: 'keke-manager.png', content: logo, content_id: LOGO_CID, content_type: 'image/png' }],
      }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Resend ${res.status}: ${String(out?.message ?? out?.name ?? '')}`.slice(0, 300) };
    }
    return { ok: true, id: out?.id ?? null };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message ?? e).slice(0, 300) };
  }
}

async function finish(
  db: SupabaseClient,
  id: number,
  patch: { status: 'sent' | 'failed' | 'skipped'; last_error?: string | null; provider_id?: string | null; recipient?: string | null },
): Promise<void> {
  await db
    .from('account_emails')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      ...(patch.status === 'sent' ? { sent_at: new Date().toISOString(), last_error: null } : {}),
    })
    .eq('id', id);
}

type UserRow = {
  email: string | null;
  full_name: string | null;
  role: string | null;
  company_phone: string | null;
  company_id_code: string | null;
  company_director: string | null;
};

async function processQueue(db: SupabaseClient): Promise<Record<string, unknown>> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, waitingFor: 'RESEND_API_KEY' };

  const { data, error } = await db.rpc('claim_account_emails', { p_limit: BATCH });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as QueueRow[];
  const tally = { sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    if (Date.now() - Date.parse(row.created_at) > STALE_MS) {
      await finish(db, row.id, { status: 'skipped', last_error: 'older than two days' });
      tally.skipped++;
      continue;
    }
    const { data: u } = await db
      .from('users')
      .select('email, full_name, role, company_phone, company_id_code, company_director')
      .eq('id', row.user_id)
      .maybeSingle();
    const user = u as UserRow | null;
    const to = user?.email?.trim() ?? '';
    // The app sets the role a moment after the account appears; a row that is
    // not a company yet waits for the next round instead of being dropped.
    if (!user || !to || user.role !== 'company') {
      const young = Date.now() - Date.parse(row.created_at) < 30 * 60 * 1000;
      await finish(db, row.id, young
        ? { status: 'failed', last_error: 'not a company yet' }
        : { status: 'skipped', last_error: 'not a company' });
      if (young) tally.failed++;
      else tally.skipped++;
      continue;
    }
    const input: CompanyWelcomeInput = {
      companyName: user.full_name?.trim() || to,
      email: to,
      phone: user.company_phone,
      idCode: user.company_id_code,
      director: user.company_director,
    };
    const mail = renderCompanyWelcome(input, `cid:${LOGO_CID}`);
    const sent = await sendResend(key, `account-${row.kind}-${row.id}`, to, mail);
    if (sent.ok) {
      await finish(db, row.id, { status: 'sent', provider_id: sent.id, recipient: to });
      tally.sent++;
    } else {
      await finish(db, row.id, { status: 'failed', last_error: sent.error, recipient: to });
      tally.failed++;
    }
  }
  return { ok: true, claimed: rows.length, ...tally };
}

const SAMPLE: CompanyWelcomeInput = {
  companyName: 'KEKE MANAGER (სატესტო)',
  email: 'info@kekemanager.com',
  phone: '+995 551 003 411',
  idCode: '402371189',
  director: 'აკაკი ქაჩიბაია',
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);
  const db = admin();
  const secret = await setting(db, 'account_email_hook_secret');
  if (!secret || req.headers.get('x-keke-account-secret') !== secret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    if (body.action === 'preview') {
      const { subject, html, text } = renderCompanyWelcome(SAMPLE, `cid:${LOGO_CID}`);
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
      const key = Deno.env.get('RESEND_API_KEY');
      if (!key) return json({ ok: false, error: 'RESEND_API_KEY missing' }, 500);
      const mail = renderCompanyWelcome({ ...SAMPLE, email: to }, `cid:${LOGO_CID}`);
      return json(await sendResend(key, `account-test-${crypto.randomUUID()}`, to, mail));
    }

    return json(await processQueue(db));
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
