-- Tour odometer photos: start/end dashboard readings for fuel accounting (tours only in app).

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS odometer_start_photo_url text,
  ADD COLUMN IF NOT EXISTS odometer_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS odometer_end_photo_url text,
  ADD COLUMN IF NOT EXISTS odometer_end_at timestamptz;

COMMENT ON COLUMN public.bookings.odometer_start_photo_url IS 'Driver odometer photo at tour start (tour/day_tour).';
COMMENT ON COLUMN public.bookings.odometer_end_photo_url IS 'Driver odometer photo at tour end (tour/day_tour).';

-- Allow drivers to upload under media/odometer/{user_id}/...
DROP POLICY IF EXISTS "media_insert_own" ON storage.objects;
CREATE POLICY "media_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'media'
    AND (
      (
        (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification', 'odometer')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "media_update_own" ON storage.objects;
CREATE POLICY "media_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      (
        (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification', 'odometer')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'media'
    AND (
      (
        (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification', 'odometer')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    )
  );

DROP POLICY IF EXISTS "media_delete_own" ON storage.objects;
CREATE POLICY "media_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'media'
    AND (
      (
        (storage.foldername(name))[1] IN ('avatars', 'vehicles', 'verifications', 'verification', 'odometer')
        AND (storage.foldername(name))[2] = (auth.uid())::text
      )
      OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
    )
  );
