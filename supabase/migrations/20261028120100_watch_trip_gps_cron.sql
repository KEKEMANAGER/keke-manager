-- Starts watch_trip_gps() (20261028120000_trip_events_trail_gps_watch.sql) and
-- the 30-day cleanup of the recorded route. Applied together with the app
-- update that handles the silent "gps_wake" push.

-- Before it starts: trips quiet for more than 12 hours are left alone (one
-- such trip, open since 23 October, was the only candidate when this went live).
create or replace function public.watch_trip_gps()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r            record;
  w            public.trip_gps_watch%rowtype;
  tok          text;
  tbilisi_hour int := extract(hour from (now() at time zone 'Asia/Tbilisi'));
  acted        int := 0;
begin
  for r in
    select distinct on (b.driver_id)
           b.driver_id, b.id as booking_id, dl.updated_at as loc_at
      from public.bookings b
      join public.driver_locations dl on dl.driver_id = b.driver_id
     where b.status = 'in_progress'
       and b.driver_id is not null
       -- He chose to be located only while the app is open: respected.
       and coalesce(dl.gps_mode, 'background') <> 'foreground'
       -- A trip quiet for half a day is one left open, not a GPS that just
       -- stopped: nobody is told about that one.
       and dl.updated_at > now() - interval '12 hours'
     order by b.driver_id, b.updated_at desc
  loop
    -- Live: nothing to do, and a spell that was going on is over.
    if r.loc_at > now() - interval '10 minutes' then
      delete from public.trip_gps_watch where driver_id = r.driver_id;
      continue;
    end if;

    select * into w from public.trip_gps_watch where driver_id = r.driver_id;
    if not found or w.quiet_since is distinct from r.loc_at then
      insert into public.trip_gps_watch (driver_id, booking_id, quiet_since)
      values (r.driver_id, r.booking_id, r.loc_at)
      on conflict (driver_id) do update
        set booking_id     = excluded.booking_id,
            quiet_since    = excluded.quiet_since,
            silent_sent_at = null,
            silent_count   = 0,
            alert_sent_at  = null,
            alert_count    = 0;
      select * into w from public.trip_gps_watch where driver_id = r.driver_id;
    end if;

    tok := public.fetch_user_push_token(r.driver_id);

    -- 1) Wake the app without showing anything: it reports where it is and
    --    restarts the trip's GPS. Every 10 minutes, at most 6 times a spell.
    if tok is not null
       and w.silent_count < 6
       and (w.silent_sent_at is null or w.silent_sent_at < now() - interval '10 minutes') then
      perform public.send_expo_silent_push(
        tok,
        jsonb_build_object('type', 'gps_wake', 'booking_id', r.booking_id::text)
      );
      update public.trip_gps_watch
         set silent_sent_at = now(), silent_count = silent_count + 1
       where driver_id = r.driver_id;
      acted := acted + 1;
    end if;

    -- 2) Still quiet after 20 minutes: tell the driver. By day only, at most
    --    every two hours and three times a spell.
    if r.loc_at < now() - interval '20 minutes'
       and tbilisi_hour between 8 and 21
       and w.alert_count < 3
       and (w.alert_sent_at is null or w.alert_sent_at < now() - interval '2 hours') then
      perform public.booking_notify(
        r.driver_id,
        'KEKE · GPS',
        'GPS გაჩერდა. გახსენი KEKE Manager, რომ კომპანიამ რუკაზე დაგინახოს.',
        'gps_stopped',
        jsonb_build_object('type', 'gps_stopped', 'booking_id', r.booking_id::text)
      );
      update public.trip_gps_watch
         set alert_sent_at = now(), alert_count = alert_count + 1
       where driver_id = r.driver_id;
      acted := acted + 1;
    end if;
  end loop;

  -- Trips that ended take their spell with them.
  delete from public.trip_gps_watch g
   where not exists (
     select 1 from public.bookings b
      where b.driver_id = g.driver_id and b.status = 'in_progress'
   );

  return acted;
end;
$function$;

revoke all on function public.watch_trip_gps() from public, anon, authenticated;
grant execute on function public.watch_trip_gps() to service_role;

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
