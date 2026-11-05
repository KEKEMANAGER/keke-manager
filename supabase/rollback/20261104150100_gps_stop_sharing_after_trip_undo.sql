-- Undo 20261104150100_gps_stop_sharing_after_trip.sql: the server again
-- stores every road point and background position a driver's app sends and
-- takes the phone's clock for when a point happened; the road's three read
-- rules (company, fleet owner, admin) are again exactly production's of
-- 2026-11-04 (supabase/tests/fixtures/prod_gps_snapshot_2026-11-04.sql and the
-- GPS backup of that day); positions are no longer tidied; the 30-day road
-- clean-up again deletes every point by the phone's clock, as production had
-- it; the server no longer notes when trips start. Positions the tidy job
-- removed while it ran are not brought back by this file (they were stale or
-- left over from finished trips; the phone writes a new one with its next
-- report) - the GPS backup of 2026-11-04 (03_data.sql) can put back the ones
-- it holds. Road points stored meanwhile stay; only the column that said how
-- the server checked them goes.

do $cron$
begin
  if to_regprocedure('cron.unschedule(text)') is not null
     and exists (select 1 from cron.job where jobname = 'gps-tidy-pins') then
    perform cron.unschedule('gps-tidy-pins');
  end if;
  if to_regprocedure('cron.schedule(text,text,text)') is not null
     and exists (select 1 from cron.job where jobname = 'trail-cleanup') then
    perform cron.schedule('trail-cleanup', '17 3 * * *',
      'delete from public.driver_location_trail where recorded_at < now() - interval ''30 days'';');
  end if;
end
$cron$;

drop policy if exists driver_location_trail_company_read on public.driver_location_trail;
create policy driver_location_trail_company_read on public.driver_location_trail
  as permissive for select to authenticated
  using (((booking_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM bookings b
  WHERE ((b.id = driver_location_trail.booking_id) AND (b.company_id = auth.uid()))))));

drop policy if exists driver_location_trail_fleet_host_read on public.driver_location_trail;
create policy driver_location_trail_fleet_host_read on public.driver_location_trail
  as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM driver_fleet f
  WHERE ((f.host_driver_id = auth.uid()) AND (f.sub_driver_id = driver_location_trail.driver_id) AND (f.status = 'accepted'::text)))));

drop policy if exists driver_location_trail_admin_read on public.driver_location_trail;
create policy driver_location_trail_admin_read on public.driver_location_trail
  as permissive for select to authenticated
  using (is_admin_user());

drop trigger if exists driver_locations_10_trip_guard on public.driver_locations;
drop trigger if exists driver_locations_05_device_clock on public.driver_locations;
drop trigger if exists driver_locations_15_device_clock on public.driver_locations;
drop trigger if exists driver_location_trail_10_trip_points on public.driver_location_trail;
drop trigger if exists bookings_gps_trip_start on public.bookings;
drop function if exists public.bookings_gps_trip_start();
drop function if exists public.gps_tidy_pins(timestamptz);
drop function if exists public.driver_locations_trip_guard();
drop function if exists public.driver_locations_device_clock();
drop function if exists public.driver_location_trail_keep_trip_points();
drop function if exists public.gps_road_point_visible(text, bigint);
drop function if exists public.gps_road_point_visible(text, uuid, timestamptz, text);
drop function if exists public.gps_road_point_kind(uuid, uuid, timestamptz);
drop function if exists public.gps_trip_accepts_point(uuid, uuid, timestamptz);
drop function if exists public.gps_backfill_trip_check();
drop function if exists public.gps_count_skip(text, uuid);
drop function if exists public.gps_count_skip(text);
drop index if exists public.driver_location_trail_created_idx;
alter table public.driver_location_trail drop constraint if exists driver_location_trail_trip_check_check;
alter table public.driver_location_trail drop column if exists trip_check;
drop table if exists public.gps_device_clock;
drop table if exists public.gps_skip_counts;
drop table if exists public.gps_trip_start;
