-- Booking reminders in PostgreSQL (no Edge Function deploy needed).
-- Run in SQL Editor. Replaces cron HTTP call to booking-reminders Edge Function.
-- Timings: 12h reminder, 1h45m confirm, auto-reassign 24min after confirm push.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.parse_booking_start_ts(p_date_display text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  raw text := trim(COALESCE(p_date_display, ''));
  ts timestamptz;
BEGIN
  IF raw = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    ts := raw::timestamptz;
    RETURN ts;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.fetch_user_push_token(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(trim(p.push_token), ''),
    NULLIF(trim(u.push_token), '')
  )
  FROM (SELECT p_user_id AS id) x
  LEFT JOIN public.profiles p ON p.id = x.id
  LEFT JOIN public.users u ON u.id = x.id;
$$;

CREATE OR REPLACE FUNCTION public.send_expo_push(
  p_token text,
  p_title text,
  p_body text,
  p_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text := trim(COALESCE(p_token, ''));
BEGIN
  IF t = '' THEN
    RETURN;
  END IF;
  IF NOT (
    t LIKE 'ExponentPushToken[%'
    OR t LIKE 'ExpoPushToken[%'
    OR t LIKE 'ExponentPushToken%'
    OR t LIKE 'ExpoPushToken%'
  ) THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Accept', 'application/json'
    ),
    body := jsonb_build_object(
      'to', t,
      'title', COALESCE(p_title, 'KEKE Manager'),
      'body', COALESCE(p_body, ''),
      'sound', 'default',
      'priority', 'high',
      'channelId', 'bookings',
      'data', COALESCE(p_data, '{}'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_route_summary(
  p_from text,
  p_to text,
  p_route text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN nullif(trim(p_from), '') IS NOT NULL AND nullif(trim(p_to), '') IS NOT NULL
      THEN trim(p_from) || ' → ' || trim(p_to)
    ELSE COALESCE(nullif(trim(p_route), ''), '—')
  END;
$$;

CREATE OR REPLACE FUNCTION public.booking_type_label_ka(
  p_kind text,
  p_booking_type text,
  p_flight_direction text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer'))
      IN ('transfer_arrival', 'transfer') AND lower(trim(coalesce(p_flight_direction, ''))) = 'arrival'
      THEN 'ტრანსფერი — ჩამოსვლა'
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer'))
      IN ('transfer_departure', 'transfer') AND lower(trim(coalesce(p_flight_direction, ''))) = 'departure'
      THEN 'ტრანსფერი — გამგზავრება'
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer')) = 'tour'
      THEN 'ტური'
    WHEN lower(coalesce(nullif(trim(p_kind), ''), nullif(trim(p_booking_type), ''), 'transfer')) IN ('day_tour', 'daytour', 'day tour')
      THEN 'ერთდღიანი ტური'
    ELSE 'ტრანსფერი'
  END;
$$;

CREATE OR REPLACE FUNCTION public.driver_matches_booking_category(
  p_is_guide boolean,
  p_is_hired boolean,
  p_category text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(trim(coalesce(p_category, 'all')))
    WHEN 'guide' THEN coalesce(p_is_hired, false) = false AND coalesce(p_is_guide, false) = true
    WHEN 'own_vehicle' THEN coalesce(p_is_hired, false) = false AND coalesce(p_is_guide, false) = false
    ELSE coalesce(p_is_hired, false) = false
  END;
$$;

CREATE OR REPLACE FUNCTION public.driver_matches_required_languages(
  p_driver_langs text[],
  p_required text[]
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_required IS NULL
    OR cardinality(p_required) = 0
    OR EXISTS (
      SELECT 1
      FROM unnest(coalesce(p_driver_langs, ARRAY[]::text[])) dl
      JOIN unnest(p_required) req ON lower(trim(dl)) = lower(trim(req))
    );
$$;

CREATE OR REPLACE FUNCTION public.find_replacement_driver_for_booking(
  p_booking_id uuid,
  p_exclude_driver_id uuid
)
RETURNS TABLE (
  driver_id uuid,
  full_name text,
  phone text,
  vehicle_id uuid,
  vehicle_plate text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH b AS (
    SELECT
      id,
      lower(trim(vehicle_type)) AS vt,
      lower(trim(vehicle_class)) AS vc,
      requested_driver_category,
      required_languages
    FROM public.bookings
    WHERE id = p_booking_id
  ),
  candidates AS (
    SELECT
      u.id AS driver_id,
      u.full_name,
      u.phone,
      v.id AS vehicle_id,
      v.plate AS vehicle_plate,
      coalesce(u.is_available, false) AS is_available,
      u.available_updated_at
    FROM b
    JOIN public.vehicles v
      ON lower(trim(v.type)) = b.vt
     AND lower(trim(v.class)) = b.vc
     AND coalesce(v.is_active, true) = true
    JOIN public.users u ON u.id::text = v.driver_id::text
    WHERE b.vt <> '' AND b.vc <> ''
      AND u.role = 'driver'
      AND coalesce(u.is_verified, false) = true
      AND u.id IS DISTINCT FROM p_exclude_driver_id
      AND public.driver_matches_booking_category(
        u.is_guide_driver, u.is_hired_driver, b.requested_driver_category
      )
      AND public.driver_matches_required_languages(u.languages, b.required_languages)
  )
  SELECT c.driver_id, c.full_name, c.phone, c.vehicle_id, c.vehicle_plate
  FROM candidates c
  ORDER BY c.is_available DESC, c.available_updated_at DESC NULLS LAST, c.full_name ASC NULLS LAST
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- Main worker (12h / 1h45m / 24min reassign)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_booking_reminders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  start_ts timestamptz;
  ms_until bigint;
  ms_since_confirm bigint;
  route text;
  type_label text;
  date_label text;
  token text;
  sent12h int := 0;
  sent_confirm int := 0;
  reassigned int := 0;
  notified_company int := 0;
  rep record;
  old_driver uuid;
BEGIN
  FOR r IN
    SELECT *
    FROM public.bookings b
    WHERE b.driver_id IS NOT NULL
      AND b.status IN ('accepted', 'in_progress', 'confirmed')
      AND b.date_display IS NOT NULL
      AND trim(b.date_display) <> ''
  LOOP
    start_ts := public.parse_booking_start_ts(r.date_display);
    IF start_ts IS NULL OR start_ts <= now() THEN
      CONTINUE;
    END IF;

    ms_until := (EXTRACT(EPOCH FROM (start_ts - now())) * 1000)::bigint;
    route := public.booking_route_summary(r.from_location, r.to_location, r.route);
    type_label := public.booking_type_label_ka(r.kind, r.booking_type, r.flight_direction);
    date_label := to_char(start_ts AT TIME ZONE 'Asia/Tbilisi', 'DD.MM.YYYY, HH24:MI');

    -- ~12 hours before (±1 hour)
    IF NOT r.reminder_24h_sent
       AND ms_until BETWEEN (11 * 3600000) AND (13 * 3600000) THEN
      token := public.fetch_user_push_token(r.driver_id::text::uuid);
      IF token IS NOT NULL THEN
        PERFORM public.send_expo_push(
          token,
          'KEKE Manager',
          '12 საათში გაქვს ' || type_label || ': ' || route || ' - ' || date_label,
          jsonb_build_object('type', 'booking_reminder_12h', 'bookingId', r.id::text)
        );
        UPDATE public.bookings SET reminder_24h_sent = true WHERE id = r.id;
        sent12h := sent12h + 1;
      END IF;
    END IF;

    -- ~1h 45m before (±5 min)
    IF NOT r.reminder_1h_sent
       AND ms_until BETWEEN (100 * 60000) AND (110 * 60000) THEN
      token := public.fetch_user_push_token(r.driver_id::text::uuid);
      IF token IS NOT NULL THEN
        PERFORM public.send_expo_push(
          token,
          'KEKE Manager',
          '1 საათ 45 წუთში გაქვს ' || type_label || ': ' || route || '. შეძლებ? გთხოვ დაადასტურე',
          jsonb_build_object('type', 'booking_reminder_confirm', 'bookingId', r.id::text)
        );
        UPDATE public.bookings
        SET reminder_1h_sent = true, reminder_1h_sent_at = now()
        WHERE id = r.id;
        sent_confirm := sent_confirm + 1;
      END IF;
    END IF;

    -- 24 min after confirm push without driver_confirmed_1h
    IF r.reminder_1h_sent
       AND r.driver_confirmed_1h IS NULL
       AND NOT r.company_unconfirmed_alert_sent
       AND r.reminder_1h_sent_at IS NOT NULL
       AND (EXTRACT(EPOCH FROM (now() - r.reminder_1h_sent_at)) * 1000)::bigint >= (24 * 60000) THEN

      old_driver := r.driver_id::text::uuid;

      SELECT * INTO rep
      FROM public.find_replacement_driver_for_booking(r.id, old_driver)
      LIMIT 1;

      IF rep.driver_id IS NOT NULL THEN
        UPDATE public.bookings
        SET
          driver_id = rep.driver_id::text,
          driver_display_name = nullif(trim(rep.full_name), ''),
          driver_phone = nullif(trim(rep.phone), ''),
          driver_plate = nullif(trim(rep.vehicle_plate), ''),
          vehicle_id = rep.vehicle_id::text,
          driver_confirmed_1h = NULL,
          reminder_1h_sent = false,
          reminder_1h_sent_at = NULL,
          company_unconfirmed_alert_sent = true,
          status = 'accepted'
        WHERE id = r.id AND driver_id::text = old_driver::text;

        token := public.fetch_user_push_token(rep.driver_id);
        IF token IS NOT NULL THEN
          PERFORM public.send_expo_push(
            token,
            'KEKE Manager',
            'გადაგინიშნეს ' || type_label || ': ' || route || ' - ' || date_label || '. გთხოვ დაადასტურე',
            jsonb_build_object('type', 'booking_reassigned', 'bookingId', r.id::text)
          );
        END IF;

        token := public.fetch_user_push_token(r.company_id::text::uuid);
        IF token IS NOT NULL THEN
          PERFORM public.send_expo_push(
            token,
            'KEKE Manager',
            'მძღოლმა ვერ დაადასტურა. ჯავშანი ავტომატურად გადაენიჭა: ' || coalesce(nullif(trim(rep.full_name), ''), 'მძღოლი'),
            jsonb_build_object('type', 'booking_auto_reassigned', 'bookingId', r.id::text)
          );
        END IF;

        reassigned := reassigned + 1;
      ELSE
        token := public.fetch_user_push_token(r.company_id::text::uuid);
        IF token IS NOT NULL THEN
          PERFORM public.send_expo_push(
            token,
            'KEKE Manager',
            'მძღოლმა ვერ დაადასტურა ჯავშანი. შესაბამისი მძღოლი ვერ მოიძებნა — გთხოვ ხელით დანიშნო',
            jsonb_build_object('type', 'booking_driver_unconfirmed', 'bookingId', r.id::text)
          );
        END IF;
        UPDATE public.bookings SET company_unconfirmed_alert_sent = true WHERE id = r.id;
        notified_company := notified_company + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'sent12h', sent12h,
    'sentConfirm', sent_confirm,
    'reassigned', reassigned,
    'notifiedCompany', notified_company
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_booking_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_booking_reminders() TO service_role;

-- Point hourly cron at SQL worker (not Edge Function)
DO $$
DECLARE
  job_id bigint;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'booking-reminders-hourly' LIMIT 1;
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'booking-reminders-hourly',
  '0 * * * *',
  $$SELECT public.run_booking_reminders();$$
);
