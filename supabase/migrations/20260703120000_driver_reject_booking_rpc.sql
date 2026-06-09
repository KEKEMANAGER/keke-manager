-- Driver decline on pending open/targeted bookings: SECURITY DEFINER RPC bypasses RLS edge cases.

CREATE OR REPLACE FUNCTION public.is_driver_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'driver'
  );
$$;

REVOKE ALL ON FUNCTION public.is_driver_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_driver_user() TO authenticated, service_role;

DROP POLICY IF EXISTS "bookings_update_driver_reject_open" ON public.bookings;
CREATE POLICY "bookings_update_driver_reject_open" ON public.bookings
  FOR UPDATE TO authenticated
  USING (
    public.is_driver_user()
    AND status = 'pending'
    AND (
      driver_id IS NULL
      OR trim(COALESCE(driver_id::text, '')) = ''
      OR driver_id::text = auth.uid()::text
    )
  )
  WITH CHECK (
    status = 'rejected'
    AND (driver_id IS NULL OR trim(COALESCE(driver_id::text, '')) = '')
  );

CREATE OR REPLACE FUNCTION public.reject_pending_booking_as_driver(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  updated_id uuid;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_driver_user() THEN
    RAISE EXCEPTION 'driver only' USING ERRCODE = '42501';
  END IF;

  UPDATE public.bookings b
  SET
    status = 'rejected',
    driver_id = NULL,
    driver_display_name = NULL,
    driver_phone = NULL,
    driver_plate = NULL,
    updated_at = now()
  WHERE b.id = p_booking_id
    AND b.status = 'pending'
    AND (
      b.driver_id IS NULL
      OR trim(COALESCE(b.driver_id::text, '')) = ''
      OR b.driver_id::text = uid::text
    )
  RETURNING b.id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_pending_booking_as_driver(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_pending_booking_as_driver(uuid) TO authenticated, service_role;
