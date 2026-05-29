-- P0 RLS: restrict users SELECT + lock down driver_schedules
-- Companion: users_directory view + SECURITY DEFINER RPCs for app flows

-- ---------------------------------------------------------------------------
-- Helper: active booking between current user and target user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_active_booking_with_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status NOT IN ('cancelled', 'rejected')
      AND b.driver_id IS NOT NULL
      AND (
        (b.company_id = auth.uid() AND b.driver_id = target_user_id)
        OR (b.driver_id = auth.uid() AND b.company_id = target_user_id)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_booking_with_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_active_booking_with_user(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.users — replace permissive users_select_scope
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_select_scope" ON public.users;

CREATE POLICY "users_select_self" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "users_select_admin" ON public.users
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

CREATE POLICY "users_select_booking_counterparty" ON public.users
  FOR SELECT TO authenticated
  USING (public.has_active_booking_with_user(id));

-- ---------------------------------------------------------------------------
-- users_directory — safe columns for discovery / chat names (no PII)
-- security_invoker = false: view owner reads base table; only safe cols exposed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.users_directory
WITH (security_invoker = false) AS
SELECT
  id,
  role,
  full_name,
  avatar_url,
  bio,
  languages,
  city,
  is_verified,
  verification_status,
  is_hired_driver,
  is_guide_driver,
  available_for_hire,
  experience_years,
  created_at
FROM public.users
WHERE
  (role = 'driver' AND COALESCE(is_verified, false) = true)
  OR role = 'company';

GRANT SELECT ON public.users_directory TO authenticated;

-- ---------------------------------------------------------------------------
-- Fleet: host reads sub-driver email/name only for their fleet rows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fleet_members_directory(p_host_driver_id uuid)
RETURNS TABLE (
  sub_driver_id uuid,
  full_name text,
  email text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    f.sub_driver_id,
    u.full_name,
    u.email
  FROM public.driver_fleet f
  INNER JOIN public.users u ON u.id = f.sub_driver_id
  WHERE f.host_driver_id = p_host_driver_id
    AND f.status IN ('pending', 'accepted')
    AND auth.uid() = p_host_driver_id
    AND EXISTS (
      SELECT 1
      FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role = 'driver'
    );
$$;

REVOKE ALL ON FUNCTION public.get_fleet_members_directory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fleet_members_directory(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Fleet invite: resolve driver id by uuid or email (caller must be a driver)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_driver_for_fleet_invite(p_lookup text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lookup text := trim(p_lookup);
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'driver'
  ) THEN
    RETURN NULL;
  END IF;

  IF v_lookup = '' THEN
    RETURN NULL;
  END IF;

  IF v_lookup ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    SELECT u.id INTO v_id
    FROM public.users u
    WHERE u.id = v_lookup::uuid
      AND u.role = 'driver';
  ELSE
    SELECT u.id INTO v_id
    FROM public.users u
    WHERE u.role = 'driver'
      AND lower(trim(u.email)) = lower(v_lookup);
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_driver_for_fleet_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_driver_for_fleet_invite(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Job board: hired drivers with email (driver hosts only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_job_board_hired_drivers(p_only_looking boolean DEFAULT true)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  avatar_url text,
  bio text,
  languages text[],
  available_for_hire boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.avatar_url,
    u.bio,
    u.languages,
    COALESCE(u.available_for_hire, true) AS available_for_hire
  FROM public.users u
  WHERE EXISTS (
      SELECT 1 FROM public.users me
      WHERE me.id = auth.uid() AND me.role = 'driver'
    )
    AND u.role = 'driver'
    AND u.is_hired_driver = true
    AND COALESCE(u.is_verified, false) = true
    AND (NOT p_only_looking OR COALESCE(u.available_for_hire, true) = true);
$$;

REVOKE ALL ON FUNCTION public.list_job_board_hired_drivers(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_job_board_hired_drivers(boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Open-job schedule filter (companies cannot read raw driver_schedules rows)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.filter_drivers_available_for_window(
  p_driver_ids text[],
  p_range_start timestamptz,
  p_range_end timestamptz,
  p_buffer_ms bigint DEFAULT 1800000
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expanded AS (
    SELECT
      p_range_start - make_interval(secs => (p_buffer_ms::double precision / 1000.0)) AS win_start,
      p_range_end + make_interval(secs => (p_buffer_ms::double precision / 1000.0)) AS win_end
  ),
  busy AS (
    SELECT DISTINCT ds.driver_id
    FROM public.driver_schedules ds
    CROSS JOIN expanded e
    WHERE ds.driver_id = ANY (COALESCE(p_driver_ids, ARRAY[]::text[]))
      AND ds.start_time < e.win_end
      AND ds.end_time > e.win_start
  )
  SELECT COALESCE(
    array_agg(d ORDER BY d),
    ARRAY[]::text[]
  )
  FROM unnest(COALESCE(p_driver_ids, ARRAY[]::text[])) AS d
  WHERE NOT EXISTS (SELECT 1 FROM busy b WHERE b.driver_id = d);
$$;

REVOKE ALL ON FUNCTION public.filter_drivers_available_for_window(text[], timestamptz, timestamptz, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_drivers_available_for_window(text[], timestamptz, timestamptz, bigint) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.driver_schedules — replace open policies; revoke anon
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "driver_schedules_authenticated_all" ON public.driver_schedules;
DROP POLICY IF EXISTS "driver_schedules_anon_all" ON public.driver_schedules;

REVOKE ALL ON public.driver_schedules FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_schedules TO authenticated;

CREATE POLICY "driver_schedules_driver_all" ON public.driver_schedules
  FOR ALL TO authenticated
  USING ((auth.uid())::text = driver_id)
  WITH CHECK ((auth.uid())::text = driver_id);

CREATE POLICY "driver_schedules_company_select" ON public.driver_schedules
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = 'company'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.company_id = auth.uid()
          AND b.driver_id::text = driver_schedules.driver_id
          AND b.status NOT IN ('cancelled', 'rejected')
          AND b.driver_id IS NOT NULL
      )
      OR (
        driver_schedules.booking_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.bookings b
          WHERE b.id::text = driver_schedules.booking_id
            AND b.company_id = auth.uid()
            AND b.status NOT IN ('cancelled', 'rejected')
        )
      )
    )
  );
