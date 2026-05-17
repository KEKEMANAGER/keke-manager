-- App users are logged in via Supabase Auth → `authenticated` role.
-- The original `users` and `vehicles` policies only covered `anon`.
-- Without these policies, authenticated users (including admins) cannot read
-- other drivers' rows → admin verification queue returns empty.

-- ---------------------------------------------------------------------------
-- public.users
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "users_authenticated_select" ON public.users;
CREATE POLICY "users_authenticated_select" ON public.users
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "users_authenticated_insert" ON public.users;
CREATE POLICY "users_authenticated_insert" ON public.users
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "users_authenticated_update" ON public.users;
CREATE POLICY "users_authenticated_update" ON public.users
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.users TO authenticated;

-- ---------------------------------------------------------------------------
-- public.vehicles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "vehicles_authenticated_select" ON public.vehicles;
CREATE POLICY "vehicles_authenticated_select" ON public.vehicles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "vehicles_authenticated_insert" ON public.vehicles;
CREATE POLICY "vehicles_authenticated_insert" ON public.vehicles
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "vehicles_authenticated_update" ON public.vehicles;
CREATE POLICY "vehicles_authenticated_update" ON public.vehicles
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.vehicles TO authenticated;
