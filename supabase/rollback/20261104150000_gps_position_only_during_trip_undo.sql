-- Undo 20261104150000_gps_position_only_during_trip.sql: the four read rules
-- exactly as production had them before (captured 2026-11-04,
-- supabase/tests/fixtures/prod_gps_snapshot_2026-11-04.sql and the GPS backup
-- of that day), and the admin exception removed. No row changes.
--
-- After this a company again reads a driver's position through any booking
-- with him that is not cancelled or declined, a fleet owner his drivers' and
-- an admin everyone's at any time - the problems P0-1 fixed.
--
-- The log of admin openings (gps_admin_access) is a record: it is dropped only
-- if it is empty; otherwise it is kept (nothing reads it once this has run).

drop policy if exists driver_locations_company_booking_read on public.driver_locations;
create policy driver_locations_company_booking_read on public.driver_locations
  as permissive for select to authenticated
  using (((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'company'::text)))) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.company_id = auth.uid()) AND (b.driver_id = driver_locations.driver_id) AND (b.status <> ALL (ARRAY['cancelled'::text, 'rejected'::text])) AND (b.driver_id IS NOT NULL))))));

drop policy if exists driver_locations_fleet_host_read on public.driver_locations;
create policy driver_locations_fleet_host_read on public.driver_locations
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM driver_fleet f
  WHERE ((f.host_driver_id = auth.uid()) AND (f.sub_driver_id = driver_locations.driver_id) AND (f.status = 'accepted'::text)))));

drop policy if exists driver_locations_admin_read on public.driver_locations;
create policy driver_locations_admin_read on public.driver_locations
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM users u
  WHERE ((u.id = auth.uid()) AND (u.role = 'admin'::text)))));

drop policy if exists driver_location_trail_company_read on public.driver_location_trail;
create policy driver_location_trail_company_read on public.driver_location_trail
  as permissive for select to authenticated
  using (((booking_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = driver_location_trail.booking_id) AND (b.company_id = auth.uid()))))));

drop function if exists public.gps_fleet_owner_sees(uuid);
drop function if exists public.gps_admin_open_access(uuid, text, integer);
drop function if exists public.gps_admin_close_access(uuid);

do $log$
begin
  if to_regclass('public.gps_admin_access') is not null then
    if exists (select 1 from public.gps_admin_access) then
      raise notice 'gps_admin_access holds % admin openings: kept as a record',
        (select count(*) from public.gps_admin_access);
    else
      drop table public.gps_admin_access;
    end if;
  end if;
end
$log$;
