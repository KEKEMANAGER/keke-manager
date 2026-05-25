-- Tighten RLS: ratings, storage bucket media, company_members
-- company_id may be uuid or text in production — compare via ::text on both sides.

-- ---------------------------------------------------------------------------
-- public.ratings — authenticated only; company inserts for own completed bookings
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "anon can insert ratings" ON public.ratings;
DROP POLICY IF EXISTS "anon can read ratings" ON public.ratings;

DROP POLICY IF EXISTS "ratings_authenticated_select" ON public.ratings;
CREATE POLICY "ratings_authenticated_select" ON public.ratings
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "ratings_company_insert" ON public.ratings;
CREATE POLICY "ratings_company_insert" ON public.ratings
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id::text = (auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'company'
    )
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id::text = booking_id::text
        AND b.company_id::text = (auth.uid())::text
        AND b.status = 'completed'
    )
  );

DROP POLICY IF EXISTS "ratings_admin_all" ON public.ratings;
CREATE POLICY "ratings_admin_all" ON public.ratings
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

REVOKE ALL ON public.ratings FROM anon;
GRANT SELECT, INSERT ON public.ratings TO authenticated;

-- ---------------------------------------------------------------------------
-- storage.objects — bucket media: public read; writes only under own user folder
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "media_select" ON storage.objects;
DROP POLICY IF EXISTS "media_insert" ON storage.objects;
DROP POLICY IF EXISTS "media_update" ON storage.objects;
DROP POLICY IF EXISTS "media_delete" ON storage.objects;

CREATE POLICY "media_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media');

CREATE POLICY "media_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification')
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "media_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification')
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification')
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification')
      AND (storage.foldername(name))[2] = (auth.uid())::text
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- public.company_members — scoped to owning company (+ admin)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "company_members_anon_select" ON public.company_members;
DROP POLICY IF EXISTS "company_members_anon_insert" ON public.company_members;
DROP POLICY IF EXISTS "company_members_anon_delete" ON public.company_members;

DROP POLICY IF EXISTS "company_members_authenticated_select" ON public.company_members;
DROP POLICY IF EXISTS "company_members_authenticated_insert" ON public.company_members;
DROP POLICY IF EXISTS "company_members_authenticated_delete" ON public.company_members;

CREATE POLICY "company_members_select_scope" ON public.company_members
  FOR SELECT TO authenticated
  USING (
    company_id::text = (auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "company_members_insert_own" ON public.company_members
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id::text = (auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'company'
    )
  );

CREATE POLICY "company_members_delete_own" ON public.company_members
  FOR DELETE TO authenticated
  USING (
    company_id::text = (auth.uid())::text
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

REVOKE ALL ON public.company_members FROM anon;
GRANT SELECT, INSERT, DELETE ON public.company_members TO authenticated;
