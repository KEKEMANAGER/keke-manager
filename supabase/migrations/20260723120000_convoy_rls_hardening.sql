-- Convoy: drivers must not read group master rows via open-pending SELECT (aggregate price leak).

DROP POLICY IF EXISTS "bookings_select_participants" ON public.bookings;

CREATE POLICY "bookings_select_participants" ON public.bookings
  FOR SELECT TO authenticated
  USING (
    company_id::text = auth.uid()::text
    OR driver_id::text = auth.uid()::text
    OR host_driver_id = auth.uid()
    OR (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'driver')
      AND status = 'pending'
      AND COALESCE(is_group_master, false) = false
      AND (
        driver_id IS NULL
        OR trim(COALESCE(driver_id::text, '')) = ''
      )
    )
    OR (
      EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'driver')
      AND status = 'pending'
      AND COALESCE(is_group_master, false) = false
      AND driver_id::text = auth.uid()::text
    )
  );

COMMENT ON POLICY "bookings_select_participants" ON public.bookings IS
  'Company, assigned driver/host, or open pending legs only (never group master rows).';
