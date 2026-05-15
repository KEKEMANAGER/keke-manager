-- Logged-in app users use the `authenticated` role (Supabase Auth JWT), not `anon`.
-- Without these policies, SELECT/INSERT/DELETE on company_members fail or return nothing.

DROP POLICY IF EXISTS "company_members_authenticated_select" ON public.company_members;
CREATE POLICY "company_members_authenticated_select" ON public.company_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "company_members_authenticated_insert" ON public.company_members;
CREATE POLICY "company_members_authenticated_insert" ON public.company_members
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "company_members_authenticated_delete" ON public.company_members;
CREATE POLICY "company_members_authenticated_delete" ON public.company_members
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, DELETE ON public.company_members TO anon, authenticated;
