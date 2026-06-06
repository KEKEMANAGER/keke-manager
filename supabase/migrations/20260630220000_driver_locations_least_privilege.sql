-- Least-privilege fix for driver_locations SELECT:
-- - Replaces driver_locations_company_read (any company could read all driver pins).
-- - Company: only drivers on their non-cancelled/non-rejected bookings.
-- - Admin: all locations. Self-update and fleet_host read policies unchanged.

DROP POLICY IF EXISTS "driver_locations_company_read" ON public.driver_locations;

CREATE POLICY "driver_locations_admin_read" ON public.driver_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'admin')
  );

CREATE POLICY "driver_locations_company_booking_read" ON public.driver_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'company')
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.company_id = auth.uid()
        AND b.driver_id = driver_locations.driver_id
        AND b.status NOT IN ('cancelled', 'rejected')
        AND b.driver_id IS NOT NULL
    )
  );
