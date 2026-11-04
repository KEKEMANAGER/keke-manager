-- Undo 20261104150100_gps_stop_sharing_after_trip.sql: the server again
-- stores every road point and background position a driver's app sends, takes
-- the phone's clock for when a point happened, and stops removing positions;
-- the 30-day road clean-up again counts from the phone's clock, exactly as
-- production had it. Positions the tidy job removed while it ran are not
-- brought back by this file (they were stale or left over from finished
-- trips; the phone writes a new one with its next report) - the GPS backup of
-- 2026-11-04 (03_data.sql) can put back the ones it holds.

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

drop trigger if exists driver_locations_10_trip_guard on public.driver_locations;
drop trigger if exists driver_locations_15_device_clock on public.driver_locations;
drop trigger if exists driver_location_trail_10_trip_points on public.driver_location_trail;
drop function if exists public.gps_tidy_pins(timestamptz);
drop function if exists public.driver_locations_trip_guard();
drop function if exists public.driver_locations_device_clock();
drop function if exists public.driver_location_trail_keep_trip_points();
drop function if exists public.gps_trip_accepts_point(uuid, uuid, timestamptz);
drop table if exists public.gps_device_clock;
