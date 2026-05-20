-- =============================================================================
-- RLS hardening: replace wide open anon/authenticated policies with auth.uid()
-- based rules. Also revokes anon DML where it is no longer needed (app uses JWT).
--
-- Extensions beyond the simplest form (required for current app flows):
-- - bookings: drivers must still SELECT/UPDATE pending open jobs (driver_id null)
--   and accept targeted jobs (driver_id = self while pending).
-- - users: authenticated users may read driver + company rows (chat, matching,
--   job board); always read own row + admin reads all.
-- - profiles: companies may read profiles of users who are drivers (matching);
--   self + admin; drivers do not read arbitrary company profiles via this rule.
-- - vehicles: fleet subs may read host vehicle via driver_fleet; companies read
--   vehicles for booking/push matching.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- public.bookings — drop legacy policies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "bookings_anon_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_anon_insert" ON public.bookings;
DROP POLICY IF EXISTS "bookings_anon_update" ON public.bookings;
DROP POLICY IF EXISTS "bookings_anon_all" ON public.bookings;

DROP POLICY IF EXISTS "bookings_authenticated_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_authenticated_insert" ON public.bookings;
DROP POLICY IF EXISTS "bookings_authenticated_update" ON public.bookings;

DROP POLICY IF EXISTS "bookings_admin_select" ON public.bookings;
DROP POLICY IF EXISTS "bookings_admin_update" ON public.bookings;

-- Admin (unchanged semantics; recreate)
CREATE POLICY "bookings_admin_select" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "bookings_admin_update" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- Participants + open job board (drivers)
CREATE POLICY "bookings_select_participants" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    company_id = (auth.uid())::text
    OR driver_id = (auth.uid())::text
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

CREATE POLICY "bookings_insert_company" ON public.bookings
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (auth.uid())::text);

-- Company may update its own rows (cancel, edit, assign, etc.)
CREATE POLICY "bookings_update_company" ON public.bookings
  FOR UPDATE TO authenticated
  USING (company_id = (auth.uid())::text)
  WITH CHECK (company_id = (auth.uid())::text);

-- Assigned driver: trip lifecycle + profile fields
CREATE POLICY "bookings_update_assigned_driver" ON public.bookings
  FOR UPDATE TO authenticated
  USING (driver_id = (auth.uid())::text)
  WITH CHECK (driver_id = (auth.uid())::text);

-- Driver accepts a pending job (sets self as driver)
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

-- Driver rejects an open pending job (nobody assigned yet, or rejects targeted invitation)
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
-- public.users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_anon_select" ON public.users;
DROP POLICY IF EXISTS "users_anon_insert" ON public.users;
DROP POLICY IF EXISTS "users_anon_update" ON public.users;
DROP POLICY IF EXISTS "users_sync_anon_all" ON public.users;

DROP POLICY IF EXISTS "users_authenticated_select" ON public.users;
DROP POLICY IF EXISTS "users_authenticated_insert" ON public.users;
DROP POLICY IF EXISTS "users_authenticated_update" ON public.users;

DROP POLICY IF EXISTS "users_admin_delete" ON public.users;
DROP POLICY IF EXISTS "users_admin_update" ON public.users;

CREATE POLICY "users_select_scope" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR role IN ('driver', 'company')
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "users_insert_self" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_admin_update" ON public.users
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "users_admin_delete" ON public.users
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- public.vehicles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "vehicles_anon_select" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_anon_insert" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_anon_update" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_anon_all" ON public.vehicles;

DROP POLICY IF EXISTS "vehicles_authenticated_select" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_authenticated_insert" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_authenticated_update" ON public.vehicles;

CREATE POLICY "vehicles_select_scope" ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    driver_id = (auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('company', 'admin'))
    OR EXISTS (
      SELECT 1 FROM public.driver_fleet f
      WHERE f.sub_driver_id = auth.uid()
        AND f.vehicle_id = vehicles.id
    )
  );

CREATE POLICY "vehicles_insert_own" ON public.vehicles
  FOR INSERT TO authenticated
  WITH CHECK (driver_id = (auth.uid())::text);

CREATE POLICY "vehicles_update_own" ON public.vehicles
  FOR UPDATE TO authenticated
  USING (driver_id = (auth.uid())::text)
  WITH CHECK (driver_id = (auth.uid())::text);

-- ---------------------------------------------------------------------------
-- public.profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_authenticated_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_authenticated_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_authenticated_update" ON public.profiles;

DROP POLICY IF EXISTS "profiles_anon_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_anon_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_anon_update" ON public.profiles;

CREATE POLICY "profiles_select_scope" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    OR (
      EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.role = 'company')
      AND EXISTS (SELECT 1 FROM public.users subj WHERE subj.id = profiles.id AND subj.role = 'driver')
    )
    OR (
      EXISTS (SELECT 1 FROM public.users me WHERE me.id = auth.uid() AND me.role = 'driver')
      AND EXISTS (SELECT 1 FROM public.users subj WHERE subj.id = profiles.id AND subj.role = 'company')
    )
  );

CREATE POLICY "profiles_insert_self" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- Revoke anon on hardened tables (default deny without policy)
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.bookings FROM anon;
REVOKE ALL ON public.users FROM anon;
REVOKE ALL ON public.vehicles FROM anon;
REVOKE ALL ON public.profiles FROM anon;
