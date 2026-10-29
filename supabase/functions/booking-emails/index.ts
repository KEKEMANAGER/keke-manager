/**
 * Booking emails for companies: the voucher arrives by email when a driver
 * confirms the booking, when the trip starts and when it ends.
 *
 * The database queues one row per moment in `booking_emails` (a trigger on
 * bookings.status) and wakes this function with the shared secret it keeps in
 * `app_settings`. The function claims queued rows, builds the voucher email
 * (render.ts) and sends it through Resend from KEKE Manager's own domain. A
 * five-minute job wakes it again, so a failed send is retried.
 *
 * It needs one secret, RESEND_API_KEY (Supabase → Edge Functions → Secrets).
 * Until that is set nothing is lost: rows stay queued, and anything younger
 * than a day goes out once the key is there.
 *
 * Doors (every one needs the x-keke-email-secret header):
 *   POST {}                                          send what is queued
 *   POST {"preview": {"bookingId", "event"}}         build one email, send nothing
 *   POST {"test": {"bookingId", "event", "to"}}      send one sample to a @kekemanager.com address
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  renderBookingEmail,
  type EmailEvent,
  type EmailInput,
  type EmailVehicle,
  type RenderedEmail,
} from './render.ts';

const FROM = 'KEKE Manager <noreply@kekemanager.com>';
const REPLY_TO = 'info@kekemanager.com';
const SITE = 'https://kekemanager.com';
const BATCH = 20;
const STALE_MS = 24 * 60 * 60 * 1000;
const EVENTS: EmailEvent[] = ['confirmed', 'started', 'completed'];

type QueueRow = {
  id: number;
  booking_id: string;
  event: EmailEvent;
  driver_id: string | null;
  created_at: string;
  attempts: number;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function admin(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

let cachedSecret: string | null = null;

async function hookSecret(db: SupabaseClient): Promise<string | null> {
  if (cachedSecret) return cachedSecret;
  const { data } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'booking_email_hook_secret')
    .maybeSingle();
  cachedSecret = (data as { value?: string } | null)?.value || null;
  return cachedSecret;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function companyEmail(c: { email?: string | null; company_email?: string | null } | null): string | null {
  for (const raw of [c?.company_email, c?.email]) {
    const e = String(raw ?? '').trim();
    // The App Store review account has no real mailbox.
    if (EMAIL_RE.test(e) && !e.toLowerCase().endsWith('@kekemanager.app')) return e;
  }
  return null;
}

function languageCodes(u: Record<string, unknown> | null): string[] {
  const out = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.add(v.trim().toLowerCase().slice(0, 2));
    else if (v && typeof v === 'object' && 'code' in (v as Record<string, unknown>)) add((v as { code: unknown }).code);
  };
  for (const src of [u?.spoken_languages, u?.languages]) {
    if (Array.isArray(src)) src.forEach(add);
  }
  return [...out];
}

type Loaded = { input: EmailInput; to: string } | { skip: string };

async function loadEmail(
  db: SupabaseClient,
  bookingId: string,
  event: EmailEvent,
  eventAt: string,
  rowDriverId: string | null,
): Promise<Loaded> {
  const { data: b } = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!b) return { skip: 'booking missing' };
  if (b.status === 'cancelled' || b.status === 'rejected') return { skip: `booking ${b.status}` };
  // A trip that has already ended gets only the end email, which carries the voucher too.
  if (event !== 'completed' && b.status === 'completed') return { skip: 'already completed' };
  if (event === 'confirmed' && rowDriverId && b.driver_id && rowDriverId !== b.driver_id) {
    return { skip: 'driver changed' };
  }

  const { data: company } = await db
    .from('users')
    .select('email, company_email, company_name, full_name')
    .eq('id', b.company_id)
    .maybeSingle();
  const to = companyEmail(company);
  if (!to) return { skip: 'no company email' };

  const driverId: string | null = b.driver_id ?? null;
  const { data: du } = driverId
    ? await db
      .from('users')
      .select('full_name, phone, avatar_url, rating, rating_count, keke_certified_at, is_guide_driver, languages, spoken_languages')
      .eq('id', driverId)
      .maybeSingle()
    : { data: null };

  let veh: Record<string, any> | null = null;
  if (b.vehicle_id) {
    veh = (await db.from('vehicles').select('*').eq('id', b.vehicle_id).maybeSingle()).data;
  }
  if (!veh && driverId) {
    const { data: list } = await db.from('vehicles').select('*').eq('driver_id', driverId).eq('is_active', true);
    const rows = (list ?? []) as Record<string, any>[];
    rows.sort((x, y) => Number(y.type === b.vehicle_type) - Number(x.type === b.vehicle_type));
    veh = rows[0] ?? null;
  }

  let vehicle: EmailVehicle | null = null;
  if (veh) {
    const [make, model] = await Promise.all([
      veh.make_id ? db.from('vehicle_makes').select('name').eq('id', veh.make_id).maybeSingle() : Promise.resolve({ data: null }),
      veh.model_id ? db.from('vehicle_models').select('name').eq('id', veh.model_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    vehicle = {
      make: (make.data as { name?: string } | null)?.name ?? null,
      model: (model.data as { name?: string } | null)?.name ?? veh.model ?? null,
      year: veh.year ?? null,
      plate: veh.plate ?? b.driver_plate ?? null,
      color: veh.color ?? null,
      type: veh.type ?? b.vehicle_type ?? null,
      vehicleClass: veh.class ?? b.vehicle_class ?? null,
      photoUrl: veh.photo_front || veh.photo_left || veh.photo_right || null,
    };
  }

  let host: EmailInput['host'] = null;
  if (b.host_driver_id && b.host_driver_id !== driverId) {
    const { data: h } = await db.from('users').select('full_name, phone').eq('id', b.host_driver_id).maybeSingle();
    if (h) host = { fullName: h.full_name ?? null, phone: h.phone ?? null };
  }

  const ratingCount = Number(du?.rating_count ?? 0) || 0;
  const input: EmailInput = {
    event,
    eventAt,
    companyName: company?.company_name ?? company?.full_name ?? null,
    booking: b,
    driver: driverId
      ? {
        fullName: du?.full_name ?? b.driver_display_name ?? null,
        phone: du?.phone ?? b.driver_phone ?? null,
        avatarUrl: du?.avatar_url ?? null,
        isKekeCertified: !!du?.keke_certified_at,
        isGuideDriver: !!du?.is_guide_driver,
        ratingAverage: ratingCount > 0 ? Number(du?.rating) || null : null,
        ratingCount,
        languages: languageCodes(du),
      }
      : null,
    vehicle,
    host,
    voucherUrl: `${SITE}/company-voucher/${b.id}`,
  };
  return { input, to };
}

async function sendViaResend(
  key: string,
  idempotencyKey: string,
  to: string,
  email: RenderedEmail,
  event: EmailEvent,
): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  try {
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
        subject: email.subject,
        html: email.html,
        text: email.text,
        tags: [{ name: 'event', value: event }],
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
    .from('booking_emails')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
      ...(patch.status === 'sent' ? { sent_at: new Date().toISOString(), last_error: null } : {}),
    })
    .eq('id', id);
}

async function processQueue(): Promise<Record<string, unknown>> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) return { ok: false, waitingFor: 'RESEND_API_KEY' };

  const db = admin();
  const { data, error } = await db.rpc('claim_booking_emails', { p_limit: BATCH });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as QueueRow[];
  const tally = { sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    if (Date.now() - Date.parse(row.created_at) > STALE_MS) {
      await finish(db, row.id, { status: 'skipped', last_error: 'older than a day' });
      tally.skipped++;
      continue;
    }
    let loaded: Loaded;
    try {
      loaded = await loadEmail(db, row.booking_id, row.event, row.created_at, row.driver_id);
    } catch (e) {
      await finish(db, row.id, { status: 'failed', last_error: String((e as Error)?.message ?? e).slice(0, 300) });
      tally.failed++;
      continue;
    }
    if ('skip' in loaded) {
      await finish(db, row.id, { status: 'skipped', last_error: loaded.skip });
      tally.skipped++;
      continue;
    }
    const email = renderBookingEmail(loaded.input);
    const res = await sendViaResend(key, `booking-email-${row.id}`, loaded.to, email, row.event);
    if (res.ok) {
      await finish(db, row.id, { status: 'sent', provider_id: res.id, recipient: loaded.to });
      tally.sent++;
    } else {
      await finish(db, row.id, { status: 'failed', last_error: res.error, recipient: loaded.to });
      tally.failed++;
    }
    await sleep(600); // stay under Resend's two requests a second
  }
  return { ok: true, claimed: rows.length, ...tally };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false }, 405);

  const db = admin();
  const secret = await hookSecret(db);
  if (!secret || req.headers.get('x-keke-email-secret') !== secret) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const keyConfigured = !!Deno.env.get('RESEND_API_KEY');

  if (body.preview || body.test) {
    const p = body.preview ?? body.test;
    const event = EVENTS.includes(p?.event) ? (p.event as EmailEvent) : 'confirmed';
    const bookingId = String(p?.bookingId ?? '');
    if (!bookingId) return json({ ok: false, error: 'bookingId' }, 400);
    const { data: b } = await db.from('bookings').select('status').eq('id', bookingId).maybeSingle();
    if (!b) return json({ ok: false, error: 'booking missing' }, 404);
    // Previews ignore the "already completed" rule so any moment can be looked at.
    const loaded = await loadEmail(db, bookingId, event, new Date().toISOString(), null);
    let input: EmailInput;
    let to: string | null = null;
    if ('skip' in loaded) {
      if (!loaded.skip.startsWith('already completed')) return json({ ok: false, skipped: loaded.skip, keyConfigured });
      const again = await loadEmail(db, bookingId, 'completed', new Date().toISOString(), null);
      if ('skip' in again) return json({ ok: false, skipped: again.skip, keyConfigured });
      input = { ...again.input, event };
      to = again.to;
    } else {
      input = loaded.input;
      to = loaded.to;
    }
    const email = renderBookingEmail(input);

    if (body.test) {
      const target = String(p?.to ?? '').trim().toLowerCase();
      if (!target.endsWith('@kekemanager.com')) {
        return json({ ok: false, error: 'samples go only to @kekemanager.com addresses' }, 400);
      }
      if (!keyConfigured) return json({ ok: false, waitingFor: 'RESEND_API_KEY' });
      const res = await sendViaResend(
        Deno.env.get('RESEND_API_KEY')!,
        `booking-email-test-${bookingId}-${event}-${Date.now()}`,
        target,
        { ...email, subject: `[ნიმუში] ${email.subject}` },
        event,
      );
      return json({ ...res, to: target, subject: email.subject });
    }

    return json({ ok: true, keyConfigured, to, subject: email.subject, html: email.html, text: email.text });
  }

  const work = processQueue();
  // Answer the database at once and keep sending in the background.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
    return json({ ok: true, keyConfigured, accepted: true }, 202);
  }
  return json(await work);
});
