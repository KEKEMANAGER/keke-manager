-- Driver / fleet host completes an in-progress booking (bypasses RLS edge cases).

CREATE OR REPLACE FUNCTION public.complete_in_progress_booking_as_driver(p_booking_id uuid)
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

  UPDATE public.bookings b
  SET
    status = 'completed',
    updated_at = now()
  WHERE b.id = p_booking_id
    AND b.status = 'in_progress'
    AND (
      lower(trim(b.driver_id::text)) = lower(uid::text)
      OR b.host_driver_id = uid
    )
  RETURNING b.id INTO updated_id;

  RETURN updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_in_progress_booking_as_driver(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_in_progress_booking_as_driver(uuid) TO authenticated, service_role;
