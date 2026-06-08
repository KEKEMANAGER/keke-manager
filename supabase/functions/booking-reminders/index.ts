import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const BOOKINGS_CHANNEL_ID = 'bookings';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const MS_HOUR = 60 * 60 * 1000;
const MS_MIN = 60 * 1000;

/** First reminder: ~12 hours before trip (±1 hour window for hourly cron). */
const REMINDER_12H_TARGET_MS = 12 * MS_HOUR;
const REMINDER_12H_WINDOW_MS = 1 * MS_HOUR;

/** Confirmation request: ~1 hour 45 minutes before trip (±5 minutes). */
const REMINDER_CONFIRM_TARGET_MS = 105 * MS_MIN;
const REMINDER_CONFIRM_WINDOW_MS = 5 * MS_MIN;

/** Auto-reassign if driver did not confirm within 24 minutes of the confirm push. */
const REASSIGN_AFTER_MS = 24 * MS_MIN;

const ACTIVE_STATUSES = ['accepted', 'in_progress', 'confirmed'];

type BookingRow = {
  id: string;
  company_id: string;
  driver_id: string | null;
  status: string;
  kind: string | null;
  booking_type: string | null;
  flight_direction: string | null;
  from_location: string | null;
  to_location: string | null;
  route: string | null;
  date_display: string | null;
  vehicle_type: string | null;
  vehicle_class: string | null;
  required_languages: string[] | null;
  requested_driver_category: string | null;
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;
  driver_confirmed_1h: boolean | null;
  reminder_1h_sent_at: string | null;
  company_unconfirmed_alert_sent: boolean;
};

type DriverCandidate = {
  id: string;
  full_name: string | null;
  phone: string | null;
  is_guide_driver: boolean | null;
  is_hired_driver: boolean | null;
  languages: string[] | null;
  is_available: boolean | null;
  available_updated_at: string | null;
  vehicle_plate: string | null;
  vehicle_id: string | null;
};

type PushResult = { ok: true } | { ok: false; error: string };

const KA_TYPE_LABELS: Record<string, string> = {
  transfer: 'ტრანსფერი',
  transfer_arrival: 'ტრანსფერი — ჩამოსვლა',
  transfer_departure: 'ტრანსფერი — გამგზავრება',
  tour: 'ტური',
  day_tour: 'ერთდღიანი ტური',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      console.error('booking-reminders: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return jsonResponse({ error: 'server_misconfigured' }, 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const now = Date.now();
    const { data: rows, error: fetchErr } = await admin
      .from('bookings')
      .select(
        'id, company_id, driver_id, status, kind, booking_type, flight_direction, from_location, to_location, route, date_display, vehicle_type, vehicle_class, required_languages, requested_driver_category, reminder_24h_sent, reminder_1h_sent, driver_confirmed_1h, reminder_1h_sent_at, company_unconfirmed_alert_sent',
      )
      .not('driver_id', 'is', null)
      .in('status', ACTIVE_STATUSES)
      .not('date_display', 'is', null);

    if (fetchErr) {
      console.error('booking-reminders: fetch failed', fetchErr.message);
      return jsonResponse({ error: fetchErr.message }, 500);
    }

    const bookings = (rows ?? []) as BookingRow[];
    let sent12h = 0;
    let sentConfirm = 0;
    let reassigned = 0;
    let notifiedCompany = 0;
    const errors: string[] = [];

    for (const booking of bookings) {
      const startMs = parseBookingStartMs(booking.date_display);
      if (startMs === null || startMs <= now) continue;

      const msUntilStart = startMs - now;
      const needs12h =
        !booking.reminder_24h_sent &&
        inWindow(msUntilStart, REMINDER_12H_TARGET_MS, REMINDER_12H_WINDOW_MS);
      const needsConfirm =
        !booking.reminder_1h_sent &&
        inWindow(msUntilStart, REMINDER_CONFIRM_TARGET_MS, REMINDER_CONFIRM_WINDOW_MS);
      const sentAtMs = booking.reminder_1h_sent_at ? Date.parse(booking.reminder_1h_sent_at) : NaN;
      const needsReassign =
        booking.reminder_1h_sent &&
        booking.driver_confirmed_1h == null &&
        !booking.company_unconfirmed_alert_sent &&
        !Number.isNaN(sentAtMs) &&
        now - sentAtMs >= REASSIGN_AFTER_MS;

      if (!needs12h && !needsConfirm && !needsReassign) continue;

      const route = routeSummary(booking);
      const typeLabel = bookingTypeLabelKa(booking);
      const dateTimeLabel = formatBookingDateTimeKa(startMs);

      if (needs12h) {
        const driverId = String(booking.driver_id ?? '').trim();
        const token = await fetchPushToken(admin, driverId);
        if (!token) {
          errors.push(`12h: no push token for booking ${booking.id}`);
        } else {
          const body = `12 საათში გაქვს ${typeLabel}: ${route} - ${dateTimeLabel}`;
          const push = await sendExpoPush(token, 'KEKE Manager', body, {
            type: 'booking_reminder_12h',
            bookingId: booking.id,
          });
          if (!push.ok) {
            errors.push(`12h push ${booking.id}: ${push.error}`);
          } else {
            const { error: updErr } = await admin
              .from('bookings')
              .update({ reminder_24h_sent: true })
              .eq('id', booking.id);
            if (updErr) errors.push(`12h flag ${booking.id}: ${updErr.message}`);
            else sent12h += 1;
          }
        }
      }

      if (needsConfirm) {
        const driverId = String(booking.driver_id ?? '').trim();
        const token = await fetchPushToken(admin, driverId);
        if (!token) {
          errors.push(`confirm: no push token for booking ${booking.id}`);
        } else {
          const body = `1 საათ 45 წუთში გაქვს ${typeLabel}: ${route}. შეძლებ? გთხოვ დაადასტურე`;
          const push = await sendExpoPush(token, 'KEKE Manager', body, {
            type: 'booking_reminder_confirm',
            bookingId: booking.id,
          });
          if (!push.ok) {
            errors.push(`confirm push ${booking.id}: ${push.error}`);
          } else {
            const sentAt = new Date().toISOString();
            const { error: updErr } = await admin
              .from('bookings')
              .update({ reminder_1h_sent: true, reminder_1h_sent_at: sentAt })
              .eq('id', booking.id);
            if (updErr) errors.push(`confirm flag ${booking.id}: ${updErr.message}`);
            else sentConfirm += 1;
          }
        }
      }

      if (needsReassign) {
        const oldDriverId = String(booking.driver_id ?? '').trim();
        const replacement = await findReplacementDriver(admin, booking, oldDriverId);

        if (replacement) {
          const { error: updErr } = await admin
            .from('bookings')
            .update({
              driver_id: replacement.id,
              driver_display_name: replacement.full_name?.trim() || null,
              driver_phone: replacement.phone?.trim() || null,
              driver_plate: replacement.vehicle_plate?.trim() || null,
              vehicle_id: replacement.vehicle_id,
              driver_confirmed_1h: null,
              reminder_1h_sent: false,
              reminder_1h_sent_at: null,
              company_unconfirmed_alert_sent: true,
              status: 'accepted',
            })
            .eq('id', booking.id)
            .eq('driver_id', oldDriverId);

          if (updErr) {
            errors.push(`reassign update ${booking.id}: ${updErr.message}`);
          } else {
            reassigned += 1;
            const newToken = await fetchPushToken(admin, replacement.id);
            if (newToken) {
              const body = `გადაგინიშნეს ${typeLabel}: ${route} - ${dateTimeLabel}. გთხოვ დაადასტურე`;
              const push = await sendExpoPush(newToken, 'KEKE Manager', body, {
                type: 'booking_reassigned',
                bookingId: booking.id,
              });
              if (!push.ok) errors.push(`reassign push ${booking.id}: ${push.error}`);
            }
            const companyId = String(booking.company_id ?? '').trim();
            const companyToken = await fetchPushToken(admin, companyId);
            if (companyToken) {
              const body = `მძღოლმა ვერ დაადასტურა. ჯავშანი ავტომატურად გადაენიჭა სხვა მძღოლს: ${replacement.full_name?.trim() || 'მძღოლი'}`;
              await sendExpoPush(companyToken, 'KEKE Manager', body, {
                type: 'booking_auto_reassigned',
                bookingId: booking.id,
              });
            }
          }
        } else {
          const companyId = String(booking.company_id ?? '').trim();
          const token = await fetchPushToken(admin, companyId);
          if (!token) {
            errors.push(`reassign fallback: no company push token for ${booking.id}`);
          } else {
            const body =
              'მძღოლმა ვერ დაადასტურა ჯავშანი. შესაბამისი მძღოლი ვერ მოიძებნა — გთხოვ ხელით დანიშნო';
            const push = await sendExpoPush(token, 'KEKE Manager', body, {
              type: 'booking_driver_unconfirmed',
              bookingId: booking.id,
            });
            if (!push.ok) {
              errors.push(`company fallback push ${booking.id}: ${push.error}`);
            } else {
              const { error: updErr } = await admin
                .from('bookings')
                .update({ company_unconfirmed_alert_sent: true })
                .eq('id', booking.id);
              if (updErr) errors.push(`company flag ${booking.id}: ${updErr.message}`);
              else notifiedCompany += 1;
            }
          }
        }
      }
    }

    return jsonResponse(
      {
        ok: true,
        processed: bookings.length,
        sent12h,
        sentConfirm,
        reassigned,
        notifiedCompany,
        errors,
      },
      200,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    console.error('booking-reminders:', msg);
    return jsonResponse({ error: msg }, 500);
  }
});

function inWindow(msUntilStart: number, targetMs: number, windowMs: number): boolean {
  const low = targetMs - windowMs;
  const high = targetMs + windowMs;
  return msUntilStart >= low && msUntilStart <= high;
}

function normalizeCategory(raw: string | null | undefined): 'all' | 'guide' | 'own_vehicle' {
  const v = String(raw ?? '').trim();
  if (v === 'guide' || v === 'own_vehicle') return v;
  return 'all';
}

function driverMatchesCategory(
  driver: { is_guide_driver?: boolean | null; is_hired_driver?: boolean | null },
  category: 'all' | 'guide' | 'own_vehicle',
): boolean {
  if (category === 'all') return driver.is_hired_driver !== true;
  const guide = driver.is_guide_driver === true;
  const hired = driver.is_hired_driver === true;
  if (hired) return false;
  if (category === 'guide') return guide;
  return !guide;
}

function driverMatchesLanguages(
  driverLangs: string[] | null | undefined,
  required: string[] | null | undefined,
): boolean {
  const req = (required ?? []).filter((x) => typeof x === 'string' && x.trim().length > 0);
  if (req.length === 0) return true;
  const have = new Set((driverLangs ?? []).map((x) => String(x).trim().toLowerCase()));
  return req.some((r) => have.has(String(r).trim().toLowerCase()));
}

async function findReplacementDriver(
  admin: ReturnType<typeof createClient>,
  booking: BookingRow,
  excludeDriverId: string,
): Promise<DriverCandidate | null> {
  const vehicleType = String(booking.vehicle_type ?? '').trim().toLowerCase();
  const vehicleClass = String(booking.vehicle_class ?? '').trim().toLowerCase();
  if (!vehicleType || !vehicleClass) return null;

  const { data: vehicleRows, error: vErr } = await admin
    .from('vehicles')
    .select('id, driver_id, type, class, plate')
    .eq('is_active', true);

  if (vErr || !vehicleRows?.length) return null;

  const vehicleByDriver = new Map<string, { id: string; plate: string | null }>();
  for (const row of vehicleRows as {
    id: string;
    driver_id: string;
    type?: string | null;
    class?: string | null;
    plate?: string | null;
  }[]) {
    const did = String(row.driver_id ?? '').trim();
    if (!did || did === excludeDriverId) continue;
    const vt = String(row.type ?? '').trim().toLowerCase();
    const vc = String(row.class ?? '').trim().toLowerCase();
    if (vt !== vehicleType || vc !== vehicleClass) continue;
    if (!vehicleByDriver.has(did)) {
      vehicleByDriver.set(did, { id: row.id, plate: row.plate ?? null });
    }
  }

  const driverIds = [...vehicleByDriver.keys()];
  if (driverIds.length === 0) return null;

  const { data: users, error: uErr } = await admin
    .from('users')
    .select(
      'id, full_name, phone, role, is_verified, is_guide_driver, is_hired_driver, languages, is_available, available_updated_at',
    )
    .in('id', driverIds)
    .eq('role', 'driver')
    .eq('is_verified', true);

  if (uErr || !users?.length) return null;

  const category = normalizeCategory(booking.requested_driver_category);
  const candidates: DriverCandidate[] = [];

  for (const u of users as {
    id: string;
    full_name?: string | null;
    phone?: string | null;
    is_guide_driver?: boolean | null;
    is_hired_driver?: boolean | null;
    languages?: string[] | null;
    is_available?: boolean | null;
    available_updated_at?: string | null;
  }[]) {
    const id = String(u.id);
    if (id === excludeDriverId) continue;
    if (!driverMatchesCategory(u, category)) continue;
    if (!driverMatchesLanguages(u.languages, booking.required_languages)) continue;
    const vehicle = vehicleByDriver.get(id);
    if (!vehicle) continue;
    candidates.push({
      id,
      full_name: u.full_name ?? null,
      phone: u.phone ?? null,
      is_guide_driver: u.is_guide_driver ?? null,
      is_hired_driver: u.is_hired_driver ?? null,
      languages: u.languages ?? null,
      is_available: u.is_available ?? null,
      available_updated_at: u.available_updated_at ?? null,
      vehicle_plate: vehicle.plate,
      vehicle_id: vehicle.id,
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const avA = a.is_available === true ? 1 : 0;
    const avB = b.is_available === true ? 1 : 0;
    if (avB !== avA) return avB - avA;
    const tA = a.available_updated_at ? Date.parse(a.available_updated_at) : 0;
    const tB = b.available_updated_at ? Date.parse(b.available_updated_at) : 0;
    return tB - tA;
  });

  return candidates[0] ?? null;
}

function parseBookingStartMs(value: string | null): number | null {
  const raw = value?.trim();
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function resolveKindCode(row: BookingRow): string {
  const k = String(row.kind ?? row.booking_type ?? 'transfer')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  const dir = String(row.flight_direction ?? '')
    .trim()
    .toLowerCase();
  if (k === 'transfer_arrival' || k === 'transfer_departure') return k;
  if (k === 'transfer' && dir === 'arrival') return 'transfer_arrival';
  if (k === 'transfer' && dir === 'departure') return 'transfer_departure';
  if (k === 'day_tour' || k === 'daytour') return 'day_tour';
  if (k === 'tour') return 'tour';
  return 'transfer';
}

function bookingTypeLabelKa(row: BookingRow): string {
  const code = resolveKindCode(row);
  return KA_TYPE_LABELS[code] ?? KA_TYPE_LABELS.transfer;
}

function routeSummary(row: BookingRow): string {
  const from = row.from_location?.trim();
  const to = row.to_location?.trim();
  if (from && to) return `${from} → ${to}`;
  const route = row.route?.trim();
  return route || '—';
}

function formatBookingDateTimeKa(startMs: number): string {
  const d = new Date(startMs);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year}, ${h}:${min}`;
}

async function fetchPushToken(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string | null> {
  const id = userId.trim();
  if (!id) return null;

  const { data: profile } = await admin
    .from('profiles')
    .select('push_token')
    .eq('id', id)
    .maybeSingle();
  const profileToken = (profile as { push_token?: string | null } | null)?.push_token?.trim();
  if (profileToken && acceptableExpoPushToken(profileToken)) return profileToken;

  const { data: userRow } = await admin.from('users').select('push_token').eq('id', id).maybeSingle();
  const legacyToken = (userRow as { push_token?: string | null } | null)?.push_token?.trim();
  if (legacyToken && acceptableExpoPushToken(legacyToken)) return legacyToken;

  return null;
}

function acceptableExpoPushToken(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  return (
    t.startsWith('ExponentPushToken[') ||
    t.startsWith('ExpoPushToken[') ||
    t.startsWith('ExponentPushToken') ||
    t.startsWith('ExpoPushToken')
  );
}

async function sendExpoPush(
  expoPushToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<PushResult> {
  const payload = {
    to: expoPushToken.trim(),
    title,
    body,
    sound: 'default',
    priority: 'high',
    channelId: BOOKINGS_CHANNEL_ID,
    data,
  };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as {
      data?: { status?: string; message?: string } | { status?: string; message?: string }[];
      errors?: { message?: string }[];
    };

    if (!res.ok) {
      const msg = json.errors?.[0]?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }

    const item = Array.isArray(json.data) ? json.data[0] : json.data;
    if (item?.status === 'error') {
      return { ok: false, error: item.message ?? 'Expo push error' };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}
