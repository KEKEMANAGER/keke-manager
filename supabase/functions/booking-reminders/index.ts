import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const BOOKINGS_CHANNEL_ID = 'bookings';
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const MS_HOUR = 60 * 60 * 1000;
const MS_MIN = 60 * 1000;

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
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;
  driver_confirmed_1h: boolean | null;
  reminder_1h_sent_at: string | null;
  company_unconfirmed_alert_sent: boolean;
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
        'id, company_id, driver_id, status, kind, booking_type, flight_direction, from_location, to_location, route, date_display, reminder_24h_sent, reminder_1h_sent, driver_confirmed_1h, reminder_1h_sent_at, company_unconfirmed_alert_sent',
      )
      .not('driver_id', 'is', null)
      .in('status', ACTIVE_STATUSES)
      .not('date_display', 'is', null);

    if (fetchErr) {
      console.error('booking-reminders: fetch failed', fetchErr.message);
      return jsonResponse({ error: fetchErr.message }, 500);
    }

    const bookings = (rows ?? []) as BookingRow[];
    let sent24h = 0;
    let sent1h = 0;
    let sentCompany = 0;
    const errors: string[] = [];

    for (const booking of bookings) {
      const startMs = parseBookingStartMs(booking.date_display);
      if (startMs === null || startMs <= now) continue;

      const msUntilStart = startMs - now;
      const needs24h =
        !booking.reminder_24h_sent && msUntilStart >= 23 * MS_HOUR && msUntilStart <= 25 * MS_HOUR;
      const needs1h =
        !booking.reminder_1h_sent && msUntilStart >= 50 * MS_MIN && msUntilStart <= 70 * MS_MIN;
      const sentAtMs = booking.reminder_1h_sent_at ? Date.parse(booking.reminder_1h_sent_at) : NaN;
      const needsCompany =
        booking.reminder_1h_sent &&
        booking.driver_confirmed_1h == null &&
        !booking.company_unconfirmed_alert_sent &&
        !Number.isNaN(sentAtMs) &&
        now - sentAtMs >= 30 * MS_MIN;

      if (!needs24h && !needs1h && !needsCompany) continue;

      const route = routeSummary(booking);
      const typeLabel = bookingTypeLabelKa(booking);
      const dateTimeLabel = formatBookingDateTimeKa(startMs);

      if (needs24h) {
        const driverId = String(booking.driver_id ?? '').trim();
        const token = await fetchPushToken(admin, driverId);
        if (!token) {
          errors.push(`24h: no push token for booking ${booking.id}`);
        } else {
          const body = `ხვალ გაქვს ${typeLabel}: ${route} - ${dateTimeLabel}`;
          const push = await sendExpoPush(token, 'KEKE Manager', body, {
            type: 'booking_reminder_24h',
            bookingId: booking.id,
          });
          if (!push.ok) {
            errors.push(`24h push ${booking.id}: ${push.error}`);
          } else {
            const { error: updErr } = await admin
              .from('bookings')
              .update({ reminder_24h_sent: true })
              .eq('id', booking.id);
            if (updErr) errors.push(`24h flag ${booking.id}: ${updErr.message}`);
            else sent24h += 1;
          }
        }
      }

      if (needs1h) {
        const driverId = String(booking.driver_id ?? '').trim();
        const token = await fetchPushToken(admin, driverId);
        if (!token) {
          errors.push(`1h: no push token for booking ${booking.id}`);
        } else {
          const body = `1 საათში გაქვს ${typeLabel}: ${route}. შეძლებ? გთხოვ დაადასტურე`;
          const push = await sendExpoPush(token, 'KEKE Manager', body, {
            type: 'booking_reminder_1h',
            bookingId: booking.id,
          });
          if (!push.ok) {
            errors.push(`1h push ${booking.id}: ${push.error}`);
          } else {
            const sentAt = new Date().toISOString();
            const { error: updErr } = await admin
              .from('bookings')
              .update({ reminder_1h_sent: true, reminder_1h_sent_at: sentAt })
              .eq('id', booking.id);
            if (updErr) errors.push(`1h flag ${booking.id}: ${updErr.message}`);
            else sent1h += 1;
          }
        }
      }

      if (needsCompany) {
        const companyId = String(booking.company_id ?? '').trim();
        const token = await fetchPushToken(admin, companyId);
        if (!token) {
          errors.push(`company alert: no push token for booking ${booking.id}`);
        } else {
          const body = 'მძღოლმა ვერ დაადასტურა ჯავშანი. გთხოვ სხვა მძღოლი დანიშნო';
          const push = await sendExpoPush(token, 'KEKE Manager', body, {
            type: 'booking_driver_unconfirmed',
            bookingId: booking.id,
          });
          if (!push.ok) {
            errors.push(`company push ${booking.id}: ${push.error}`);
          } else {
            const { error: updErr } = await admin
              .from('bookings')
              .update({ company_unconfirmed_alert_sent: true })
              .eq('id', booking.id);
            if (updErr) errors.push(`company flag ${booking.id}: ${updErr.message}`);
            else sentCompany += 1;
          }
        }
      }
    }

    return jsonResponse(
      {
        ok: true,
        processed: bookings.length,
        sent24h,
        sent1h,
        sentCompany,
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
