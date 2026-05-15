-- App uses Supabase Auth JWT → `authenticated` role; mirror anon policies for bookings.
DROP POLICY IF EXISTS "bookings_authenticated_select" ON public.bookings;
CREATE POLICY "bookings_authenticated_select" ON public.bookings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bookings_authenticated_insert" ON public.bookings;
CREATE POLICY "bookings_authenticated_insert" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bookings_authenticated_update" ON public.bookings;
CREATE POLICY "bookings_authenticated_update" ON public.bookings
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
