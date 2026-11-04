-- Undo 20261104150000_gps_company_sees_live_trip_only.sql: the two company
-- read rules exactly as production had them before (captured 2026-11-04,
-- supabase/tests/fixtures/prod_gps_snapshot_2026-11-04.sql). Nothing else is
-- touched; no row changes.
--
-- After this a company again reads a driver's position through any booking
-- with him that is not cancelled or declined - the problem P0-1 fixed.

drop policy if exists driver_locations_company_booking_read on public.driver_locations;
create policy driver_locations_company_booking_read on public.driver_locations
  as permissive for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'company'::text)))) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.company_id = auth.uid()) AND (b.driver_id = driver_locations.driver_id) AND (b.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])) AND (b.driver_id IS NOT NULL))))));

drop policy if exists driver_location_trail_company_read on public.driver_location_trail;
create policy driver_location_trail_company_read on public.driver_location_trail
  as permissive for select to authenticated
  using (((booking_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = driver_location_trail.booking_id) AND (b.company_id = auth.uid()))))));
