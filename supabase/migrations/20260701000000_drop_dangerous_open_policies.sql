-- Remove dashboard / legacy open RLS policies found on production.
-- Re-assert least-privilege policies where direct client access is still required.

-- ---------------------------------------------------------------------------
-- 1. bookings — drop wide-open policies (keep participant-scoped policies)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "allow anon all bookings" ON public.bookings;
DROP POLICY IF EXISTS "universal_select_policy" ON public.bookings;
DROP POLICY IF EXISTS "universal_update_policy" ON public.bookings;

-- Legacy names that may coexist with the above
DROP POLICY IF EXISTS "bookings_anon_all" ON public.bookings;
DROP POLICY IF EXISTS "bookings_authenticated_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_authenticated_update" ON public.bookings;

-- Ensure canonical participant policies exist (idempotent recreate)
DROP POLICY IF EXISTS "bookings_admin_select" ON public.bookings;
CREATE POLICY "bookings_admin_select" ON public.bookings
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

DROP POLICY IF EXISTS "bookings_admin_update" ON public.bookings;
CREATE POLICY "bookings_admin_update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "bookings_select_participants" ON public.bookings;
CREATE POLICY "bookings_select_participants" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    company_id = (auth.uid())::text
    OR driver_id = (auth.uid())::text
    OR host_driver_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'driver')
      AND status = 'pending'
      AND (
        driver_id IS NULL
        OR trim(COALESCE(driver_id::text, '')) = ''
      )
    )
    OR (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'driver')
      AND status = 'pending'
      AND driver_id = (auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "bookings_insert_company" ON public.bookings;
CREATE POLICY "bookings_insert_company" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (auth.uid())::text);

DROP POLICY IF EXISTS "bookings_update_company" ON public.bookings;
CREATE POLICY "bookings_update_company" ON public.bookings
  FOR UPDATE TO authenticated
  USING (company_id = (auth.uid())::text)
  WITH CHECK (company_id = (auth.uid())::text);

DROP POLICY IF EXISTS "bookings_update_assigned_driver" ON public.bookings;
CREATE POLICY "bookings_update_assigned_driver" ON public.bookings
  FOR UPDATE TO authenticated
  USING (driver_id = (auth.uid())::text)
  WITH CHECK (driver_id = (auth.uid())::text);

DROP POLICY IF EXISTS "bookings_update_driver_accept" ON public.bookings;
CREATE POLICY "bookings_update_driver_accept" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'driver')
    AND status = 'pending'
    AND (
      driver_id IS NULL
      OR trim(COALESCE(driver_id::text, '')) = ''
      OR driver_id = (auth.uid())::text
    )
  )
  WITH CHECK (
    driver_id = (auth.uid())::text
    AND status IN ('accepted', 'confirmed')
  );

DROP POLICY IF EXISTS "bookings_update_driver_reject_open" ON public.bookings;
CREATE POLICY "bookings_update_driver_reject_open" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'driver')
    AND status = 'pending'
    AND (
      driver_id IS NULL
      OR trim(COALESCE(driver_id::text, '')) = ''
      OR driver_id = (auth.uid())::text
    )
  )
  WITH CHECK (
    status = 'rejected'
    AND driver_id IS NULL
  );

-- ---------------------------------------------------------------------------
-- 2. ratings — drop open SELECT; participant-scoped only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read ratings" ON public.ratings;
DROP POLICY IF EXISTS "anon can read ratings" ON public.ratings;
DROP POLICY IF EXISTS "ratings_authenticated_select" ON public.ratings;

CREATE POLICY "ratings_authenticated_select" ON public.ratings
  FOR SELECT TO authenticated
  USING (
    company_id::text = (auth.uid())::text
    OR driver_id::text = (auth.uid())::text
    OR public.is_admin_user()
  );

-- ---------------------------------------------------------------------------
-- 3. vehicles — drop open UPDATE; drivers update own rows only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow Auth Update Vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_authenticated_update" ON public.vehicles;

DROP POLICY IF EXISTS "vehicles_update_own" ON public.vehicles;
CREATE POLICY "vehicles_update_own" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (driver_id = (auth.uid())::text)
  WITH CHECK (driver_id = (auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 4. notifications — no direct INSERT; RPC only (create_user_notifications)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "System creates notifications" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_authenticated" ON public.notifications;

-- Re-assert notification RPC helpers (safe if already applied)
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
