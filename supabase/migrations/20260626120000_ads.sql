-- Partner ads (dashboard carousel + admin panel)

CREATE TABLE IF NOT EXISTS public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  subtitle text,
  image_url text,
  link_url text,
  is_active boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz
);

CREATE INDEX IF NOT EXISTS ads_active_created_idx
  ON public.ads (is_active, created_at DESC);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- Authenticated users: read active ads (date window filtered in app too)
DROP POLICY IF EXISTS "ads_authenticated_select_active" ON public.ads;
CREATE POLICY "ads_authenticated_select_active" ON public.ads
  FOR SELECT TO authenticated
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );

-- Admin: full CRUD
DROP POLICY IF EXISTS "ads_admin_select" ON public.ads;
CREATE POLICY "ads_admin_select" ON public.ads
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "ads_admin_insert" ON public.ads;
CREATE POLICY "ads_admin_insert" ON public.ads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "ads_admin_update" ON public.ads;
CREATE POLICY "ads_admin_update" ON public.ads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "ads_admin_delete" ON public.ads;
CREATE POLICY "ads_admin_delete" ON public.ads
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

GRANT SELECT ON public.ads TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.ads TO authenticated;

-- Storage bucket for ad images (public URLs on dashboard)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ads', 'ads', true)
ON CONFLICT (id) DO UPDATE SET public = excluded.public;

DROP POLICY IF EXISTS "ads_storage_select" ON storage.objects;
CREATE POLICY "ads_storage_select" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ads');

DROP POLICY IF EXISTS "ads_storage_admin_insert" ON storage.objects;
CREATE POLICY "ads_storage_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ads'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "ads_storage_admin_update" ON storage.objects;
CREATE POLICY "ads_storage_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ads'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'ads'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

DROP POLICY IF EXISTS "ads_storage_admin_delete" ON storage.objects;
CREATE POLICY "ads_storage_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ads'
    AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );
