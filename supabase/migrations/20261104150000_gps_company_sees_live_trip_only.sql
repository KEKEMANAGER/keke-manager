-- GPS P0-1: a company sees where a driver is only while he drives one of its
-- trips.
--
-- Production's driver_locations_company_booking_read let a company read a
-- driver's live position whenever it had ANY booking with him that was not
-- cancelled or declined: a trip finished weeks ago, a request he never
-- accepted, a job for next month. On 2026-11-04 three companies could read two
-- drivers' positions through finished bookings alone, while those drivers
-- worked for others. The company's map only ever asked for accepted and
-- in-progress jobs, but the database is what decides, and it said yes.
--
-- Now:
--   * the position (driver_locations): only for a booking of this company that
--     is in progress (status 'in_progress') with this driver on it;
--   * the road (driver_location_trail): a company still sees the road of its
--     own trips - while the trip runs, and afterwards the points recorded up to
--     two minutes after it was completed (phone and server clocks differ a
--     little), never a point from after that. A cancelled or declined booking
--     shows no road.
--
-- What stays as it was: the driver himself, KEKE's admins, a fleet owner and
-- his own drivers (driver_locations_fleet_host_read - a business decision, not
-- part of this fix), the passenger marks (trip_events) of the company's own
-- bookings. Realtime sends a company only the rows these rules let it read.
--
-- Nothing is deleted or rewritten; only who may read changes.
--
-- Rollback: supabase/rollback/20261104150000_gps_company_sees_live_trip_only_undo.sql

drop policy if exists driver_locations_company_booking_read on public.driver_locations;
create policy driver_locations_company_booking_read on public.driver_locations
  as permissive for select to authenticated
  using (
    exists (select 1 from public.users u
             where u.id = auth.uid() and u.role = 'company')
    and exists (select 1 from public.bookings b
                 where b.company_id = auth.uid()
                   and b.driver_id = driver_locations.driver_id
                   and b.status = 'in_progress')
  );

drop policy if exists driver_location_trail_company_read on public.driver_location_trail;
create policy driver_location_trail_company_read on public.driver_location_trail
  as permissive for select to authenticated
  using (
    booking_id is not null
    and exists (select 1 from public.bookings b
                 where b.id = driver_location_trail.booking_id
                   and b.company_id = auth.uid()
                   and (b.status = 'in_progress'
                        or (b.status = 'completed'
                            and b.completed_at is not null
                            and driver_location_trail.recorded_at <= b.completed_at + interval '2 minutes')))
  );
