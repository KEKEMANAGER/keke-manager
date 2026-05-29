-- Fix infinite RLS recursion: users policy -> bookings -> users (profiles/bookings policies).
-- has_active_booking_with_user must bypass bookings RLS when checking counterparty access.

CREATE OR REPLACE FUNCTION public.has_active_booking_with_user(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
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
