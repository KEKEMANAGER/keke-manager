-- Undo 20261104150100_gps_stop_sharing_after_trip.sql: the server again
-- stores every road point and background position a driver's app sends, and
-- stops removing positions. Positions the tidy job removed while it ran are
-- not brought back (they were stale or left over from finished trips; the
-- phone writes a new one with its next report).

do $cron$
begin
  if to_regprocedure('cron.unschedule(text)') is not null
     and exists (select 1 from cron.job where jobname = 'gps-tidy-pins') then
    perform cron.unschedule('gps-tidy-pins');
  end if;
end
$cron$;

drop trigger if exists driver_locations_10_trip_guard on public.driver_locations;
drop trigger if exists driver_location_trail_10_trip_points on public.driver_location_trail;
drop function if exists public.gps_tidy_pins(timestamptz);
drop function if exists public.driver_locations_trip_guard();
drop function if exists public.driver_location_trail_keep_trip_points();
drop function if exists public.gps_trip_accepts_point(uuid, uuid, timestamptz);
