-- Pre–App Store: notification RPC, RLS hardening, profile sync, emergency driver vehicle data.

-- ---------------------------------------------------------------------------
-- Sync profiles.is_verified from users (legacy rows)
-- ---------------------------------------------------------------------------
UPDATE public.profiles p
SET is_verified = true
FROM public.users u
WHERE p.id = u.id
  AND COALESCE(u.is_verified, false) = true
  AND COALESCE(p.is_verified, false) = false;

-- ---------------------------------------------------------------------------
-- Notifications: controlled cross-user inserts (RLS direct insert = self only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_may_notify(p_target uuid, p_booking_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN false;
  END IF;
  IF p_target = uid THEN
    RETURN true;
  END IF;
  IF public.is_admin_user() THEN
    RETURN true;
  END IF;

  IF p_booking_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.status NOT IN ('cancelled', 'rejected')
      AND (
        (
          b.company_id::text = uid::text
          AND (b.driver_id IS NULL OR b.driver_id::text = p_target::text OR b.host_driver_id = p_target)
        )
        OR (b.driver_id::text = uid::text AND b.company_id::text = p_target::text)
        OR (b.host_driver_id = uid AND b.driver_id::text = p_target::text)
        OR (b.driver_id::text = uid::text AND b.host_driver_id = p_target)
        OR (b.company_id::text = uid::text AND b.host_driver_id = p_target)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status NOT IN ('cancelled', 'rejected')
      AND b.driver_id IS NOT NULL
      AND (
        (b.company_id::text = uid::text AND b.driver_id::text = p_target::text)
        OR (b.driver_id::text = uid::text AND b.company_id::text = p_target::text)
        OR (b.host_driver_id = uid AND b.driver_id::text = p_target::text)
        OR (b.driver_id::text = uid::text AND b.host_driver_id = p_target)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.driver_fleet f
    WHERE (
        (f.host_driver_id = uid AND f.sub_driver_id = p_target)
        OR (f.sub_driver_id = uid AND f.host_driver_id = p_target)
      )
      AND f.status IN ('pending', 'accepted')
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.users me
    WHERE me.id = uid AND me.role = 'company'
  ) AND EXISTS (
    SELECT 1 FROM public.users t
    WHERE t.id = p_target AND t.role = 'driver'
  ) THEN
    RETURN true;
  END IF;

  -- Job board: host driver may notify hired drivers (profile viewed, etc.)
  IF EXISTS (
    SELECT 1
    FROM public.users me, public.users t
    WHERE me.id = uid
      AND me.role = 'driver'
      AND t.id = p_target
      AND t.role = 'driver'
      AND COALESCE(t.is_hired_driver, false) = true
      AND COALESCE(t.available_for_hire, true) = true
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.user_may_notify(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_may_notify(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_user_notifications(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  target uuid;
  bid uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb))
  LOOP
    target := NULLIF(item->>'user_id', '')::uuid;
    IF target IS NULL THEN
      CONTINUE;
    END IF;

    bid := NULL;
    IF COALESCE(item->'data'->>'booking_id', '') <> '' THEN
      bid := (item->'data'->>'booking_id')::uuid;
    END IF;

    IF NOT public.user_may_notify(target, bid) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.notifications (user_id, type, title, body, data)
    VALUES (
      target,
      COALESCE(item->>'type', 'general'),
      COALESCE(item->>'title', ''),
      COALESCE(item->>'body', ''),
      COALESCE(item->'data', '{}'::jsonb)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_user_notifications(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_user_notifications(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ratings SELECT: participants + admin only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ratings_authenticated_select" ON public.ratings;
CREATE POLICY "ratings_authenticated_select" ON public.ratings
  FOR SELECT TO authenticated
  USING (
    company_id::text = (auth.uid())::text
    OR driver_id::text = (auth.uid())::text
    OR public.is_admin_user()
  );

-- ---------------------------------------------------------------------------
-- driver_fleet: companies see fleet rows tied to their bookings only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "driver_fleet_company_select" ON public.driver_fleet;
CREATE POLICY "driver_fleet_company_select" ON public.driver_fleet
  FOR SELECT TO authenticated
  USING (
    public.is_admin_user()
    OR (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'company'
      )
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.company_id::text = (auth.uid())::text
          AND b.status NOT IN ('cancelled', 'rejected')
          AND (
            b.driver_id::text = host_driver_id::text
            OR b.driver_id::text = sub_driver_id::text
            OR b.host_driver_id = host_driver_id
            OR b.host_driver_id = sub_driver_id
          )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Messages INSERT: sender + authorized counterparty
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.may_message_user(p_receiver uuid, p_booking_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR p_receiver IS NULL OR p_receiver = uid THEN
    RETURN false;
  END IF;
  IF public.is_admin_user() THEN
    RETURN true;
  END IF;

  IF p_booking_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.id = p_booking_id
      AND b.status NOT IN ('cancelled', 'rejected')
      AND (
        (b.company_id::text = uid::text AND (b.driver_id::text = p_receiver::text OR b.host_driver_id = p_receiver))
        OR (b.driver_id::text = uid::text AND b.company_id::text = p_receiver::text)
        OR (b.host_driver_id = uid AND b.driver_id::text = p_receiver::text)
        OR (b.driver_id::text = uid::text AND b.host_driver_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  IF public.has_active_booking_with_user(p_receiver) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.driver_fleet f
    WHERE f.status IN ('pending', 'accepted')
      AND (
        (f.host_driver_id = uid AND f.sub_driver_id = p_receiver)
        OR (f.sub_driver_id = uid AND f.host_driver_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE (
        (m.sender_id = uid AND m.receiver_id = p_receiver)
        OR (m.receiver_id = uid AND m.sender_id = p_receiver)
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.may_message_user(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.may_message_user(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "messages_sender_insert" ON public.messages;
CREATE POLICY "messages_sender_insert" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.may_message_user(receiver_id, booking_id)
  );

-- ---------------------------------------------------------------------------
-- Storage booking-pickup-signs: company/booking-scoped writes
-- Path: {company_id}/{booking_id}/{filename}
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "pickup_signs_authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "pickup_signs_authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "pickup_signs_authenticated_delete" ON storage.objects;

CREATE POLICY "pickup_signs_company_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'booking-pickup-signs'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.company_id::text = (auth.uid())::text
    )
  );

CREATE POLICY "pickup_signs_company_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'booking-pickup-signs'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.company_id::text = (auth.uid())::text
    )
  )
  WITH CHECK (
    bucket_id = 'booking-pickup-signs'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.company_id::text = (auth.uid())::text
    )
  );

CREATE POLICY "pickup_signs_company_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'booking-pickup-signs'
    AND (storage.foldername(name))[1] = (auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = (storage.foldername(name))[2]
        AND b.company_id::text = (auth.uid())::text
    )
  );

-- ---------------------------------------------------------------------------
-- Emergency drivers: vehicle type/class from vehicles table + optional filter
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_available_drivers_in_city(text);

CREATE OR REPLACE FUNCTION public.list_available_drivers_in_city(
  p_city text,
  p_vehicle_type text DEFAULT NULL,
  p_vehicle_class text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  current_city text,
  available_updated_at timestamptz,
  avatar_url text,
  vehicle_type text,
  vehicle_class text,
  vehicle_plate text,
  is_guide_driver boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.full_name,
    u.phone,
    u.current_city,
    u.available_updated_at,
    u.avatar_url,
    v.type AS vehicle_type,
    v.class AS vehicle_class,
    v.plate AS vehicle_plate,
    COALESCE(u.is_guide_driver, false) AS is_guide_driver
  FROM public.users u
  INNER JOIN LATERAL (
    SELECT
      vv.type,
      vv.class,
      vv.plate
    FROM public.vehicles vv
    WHERE vv.driver_id = u.id::text
      AND COALESCE(vv.is_active, true) = true
    ORDER BY vv.is_active DESC NULLS LAST, vv.updated_at DESC NULLS LAST
    LIMIT 1
  ) v ON true
  WHERE EXISTS (
      SELECT 1
      FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role = 'company'
    )
    AND u.role = 'driver'
    AND COALESCE(u.is_verified, false) = true
    AND COALESCE(u.is_hired_driver, false) = false
    AND u.is_available = true
    AND u.current_city IS NOT NULL
    AND trim(u.current_city) <> ''
    AND lower(trim(u.current_city)) = lower(trim(COALESCE(p_city, '')))
    AND (
      p_vehicle_type IS NULL
      OR trim(p_vehicle_type) = ''
      OR lower(trim(v.type)) = lower(trim(p_vehicle_type))
    )
    AND (
      p_vehicle_class IS NULL
      OR trim(p_vehicle_class) = ''
      OR lower(trim(v.class)) = lower(trim(p_vehicle_class))
    )
  ORDER BY u.available_updated_at DESC NULLS LAST, u.full_name ASC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_available_drivers_in_city(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_available_drivers_in_city(text, text, text) TO authenticated, service_role;
