-- Starts watch_trip_gps() (20261028120000_trip_events_trail_gps_watch.sql) and
-- the 30-day cleanup of the recorded route. Applied together with the app
-- update that handles the silent "gps_wake" push.

-- Every two minutes; the route is kept 30 days.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'watch-trip-gps') then
    perform cron.unschedule('watch-trip-gps');
  end if;
  perform cron.schedule('watch-trip-gps', '*/2 * * * *', 'select public.watch_trip_gps();');

  if exists (select 1 from cron.job where jobname = 'trail-cleanup') then
    perform cron.unschedule('trail-cleanup');
  end if;
  perform cron.schedule(
    'trail-cleanup',
    '17 3 * * *',
    'delete from public.driver_location_trail where recorded_at < now() - interval ''30 days'';'
  );
end
$$;
