/**
 * Booking emails for companies: the voucher arrives by email at every moment of
 * a booking — created, edited, confirmed, driver changed or declined, cancelled,
 * started, passengers picked up and dropped off, completed (render.ts lists them).
 *
 * The database queues one row per moment in `booking_emails` (triggers on
 * bookings, booking_history and trip_events) and wakes this function with the
 * shared secret it keeps in `app_settings`. The function claims queued rows,
 * builds the voucher email (render.ts) and sends it through Resend from KEKE
 * Manager's own domain. A one-minute job wakes it again for retries and for
 * edits, which wait two minutes so quick successive edits go out as one email.
 *
 * It needs one secret, RESEND_API_KEY (Supabase → Edge Functions → Secrets).
 * Until that is set nothing is lost: rows stay queued, and anything younger
 * than a day goes out once the key is there.
 *
 * Doors (every one needs the x-keke-email-secret header):
 *   POST {}                                          send what is queued
 *   POST {"preview": {"bookingId", "event"}}         build one email, send nothing
 *   POST {"test": {"bookingId", "event", "to"}}      send one sample to a @kekemanager.com address
 *
 * Every email carries the voucher as a PDF too (pdf.ts). If the PDF cannot be
 * built, the email still goes, without the attachment.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  EMAIL_EVENTS,
  renderBookingEmail,
  voucherCode,
  type EmailDetails,
  type EmailEvent,
  type EmailInput,
  type EmailVehicle,
  type RenderedEmail,
} from './render.ts';
import { renderVoucherPdf, type PdfFonts } from './pdf.ts';

const FROM = 'KEKE Manager <noreply@kekemanager.com>';
const REPLY_TO = 'info@kekemanager.com';
const SITE = 'https://kekemanager.com';
const BATCH = 8; // PDFs cost CPU time; the next wake takes the rest
const STALE_MS = 24 * 60 * 60 * 1000;

/** DejaVu Sans (Georgian + Latin), fetched once per instance from the npm CDN. */
const FONT_SOURCES = [
  'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/',
  'https://unpkg.com/dejavu-fonts-ttf@2.37.3/ttf/',
];

type QueueRow = {
  id: number;
  booking_id: string;
  event: EmailEvent;
  driver_id: string | null;
  dedupe_key: string;
  details: EmailDetails & { old_driver_id?: string | null };
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

let fontsPromise: Promise<PdfFonts | null> | null = null;

async function fetchFont(name: string): Promise<Uint8Array> {
  let last: unknown = null;
  for (const base of FONT_SOURCES) {
    try {
      const res = await fetch(base + name);
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
      last = new Error(`${res.status} ${base}${name}`);
    } catch (e) {
      last = e;
    }
  }
  throw last ?? new Error(`font ${name}`);
}

function pdfFonts(): Promise<PdfFonts | null> {
  if (!fontsPromise) {
    fontsPromise = Promise.all([fetchFont('DejaVuSans.ttf'), fetchFont('DejaVuSans-Bold.ttf')])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((e) => {
        console.error('voucher fonts', e);
        fontsPromise = null; // try again next time
        return null;
      });
  }
  return fontsPromise;
}

type Attachment = { filename: string; content: string };

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** The voucher PDF for this email, or null when it cannot be built (the email still goes). */
async function voucherAttachment(input: EmailInput, code: string): Promise<{ file: Attachment; bytes: number } | null> {
  try {
    const fonts = await pdfFonts();
    if (!fonts) return null;
    const pdf = await renderVoucherPdf(input, fonts);
    return { file: { filename: `${code}.pdf`, content: toBase64(pdf) }, bytes: pdf.length };
  } catch (e) {
    console.error('voucher pdf', e);
    return null;
  }
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
  details: QueueRow['details'] = {},
): Promise<Loaded> {
  const { data: b } = await db.from('bookings').select('*').eq('id', bookingId).maybeSingle();
  if (!b) return { skip: 'booking missing' };
  const closed = b.status === 'cancelled' || b.status === 'rejected';
  if (closed && event !== 'cancelled' && event !== 'rejected' && event !== 'voucher') {
    return { skip: `booking ${b.status}` };
  }
  // The new driver's email ("driver changed") replaces a stale confirmation.
  if (event === 'confirmed' && rowDriverId && b.driver_id && rowDriverId !== b.driver_id) {
    return { skip: 'driver changed' };
  }
  // A group booking cancelled as a whole is one email (the group's), not one per car.
  if (event === 'cancelled' && b.parent_booking_id) {
    const { data: parent } = await db.from('bookings').select('status').eq('id', b.parent_booking_id).maybeSingle();
    if (parent?.status === 'cancelled') return { skip: 'group cancelled' };
  }

  const { data: company } = await db
    .from('users')
    .select('email, company_email, company_name, full_name')
    .eq('id', b.company_id)
    .maybeSingle();
  const to = companyEmail(company);
  if (!to) return { skip: 'no company email' };

  // A declined or cancelled booking has lost its driver; the email still names who it was.
  const driverId: string | null = b.driver_id ?? details?.old_driver_id ?? rowDriverId ?? null;
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
    details,
  };
  return { input, to };
}

async function sendViaResend(
  key: string,
  idempotencyKey: string,
  to: string,
  email: RenderedEmail,
  event: EmailEvent,
  attachment: Attachment | null,
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
        ...(attachment ? { attachments: [attachment] } : {}),
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

  // Several quick edits of one booking become one email listing all changes.
  const firstEdit = new Map<string, QueueRow>();
  const merged = new Set<number>();
  for (const row of rows) {
    if (row.event !== 'edited') continue;
    const first = firstEdit.get(row.booking_id);
    if (!first) {
      firstEdit.set(row.booking_id, row);
      continue;
    }
    const into = (first.details.changes ??= {});
    for (const [key, c] of Object.entries(row.details.changes ?? {})) {
      into[key] = { ...c, old: into[key]?.old ?? c.old };
    }
    if (row.details.reason) {
      first.details.reason = [first.details.reason, row.details.reason].filter(Boolean).join('; ');
    }
    merged.add(row.id);
    await finish(db, row.id, { status: 'skipped', last_error: `merged into #${first.id}` });
    tally.skipped++;
  }

  for (const row of rows) {
    if (merged.has(row.id)) continue;
    if (Date.now() - Date.parse(row.created_at) > STALE_MS) {
      await finish(db, row.id, { status: 'skipped', last_error: 'older than a day' });
      tally.skipped++;
      continue;
    }
    let loaded: Loaded;
    try {
      const at = (row.event === 'pickup' || row.event === 'dropoff') && row.details?.happened_at
        ? String(row.details.happened_at)
        : row.created_at;
      loaded = await loadEmail(db, row.booking_id, row.event, at, row.driver_id, row.details ?? {});
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
    const pdf = await voucherAttachment(loaded.input, voucherCode(loaded.input.booking));
    const res = await sendViaResend(key, `booking-email-${row.id}`, loaded.to, email, row.event, pdf?.file ?? null);
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
    const event = EMAIL_EVENTS.includes(p?.event) ? (p.event as EmailEvent) : 'confirmed';
    const sample: QueueRow['details'] = p?.details && typeof p.details === 'object' ? p.details : {};
    const bookingId = String(p?.bookingId ?? '');
    if (!bookingId) return json({ ok: false, error: 'bookingId' }, 400);
    const { data: b } = await db.from('bookings').select('status').eq('id', bookingId).maybeSingle();
    if (!b) return json({ ok: false, error: 'booking missing' }, 404);
    // Previews draw any moment for any booking, whatever its status now.
    const loaded = await loadEmail(db, bookingId, 'voucher', String(sample.happened_at ?? new Date().toISOString()), null, sample);
    if ('skip' in loaded) return json({ ok: false, skipped: loaded.skip, keyConfigured });
    const input: EmailInput = { ...loaded.input, event };
    const to: string | null = loaded.to;
    const email = renderBookingEmail(input);
    const pdf = await voucherAttachment(input, voucherCode(input.booking));

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
        pdf?.file ?? null,
      );
      return json({ ...res, to: target, subject: email.subject, pdfBytes: pdf?.bytes ?? 0 });
    }

    return json({
      ok: true,
      keyConfigured,
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      pdfBytes: pdf?.bytes ?? 0,
      ...(p?.pdf ? { pdfBase64: pdf?.file.content ?? null } : {}),
    });
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
