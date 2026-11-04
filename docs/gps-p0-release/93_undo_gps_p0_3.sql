-- KEKE GPS P0 - UNDO P0-3 (undo files run newest first: 93, 92, 91)
-- Source: supabase/rollback/20261104150200_gps_watch_every_trip_undo.sql (md5 2b9dc35b52999a3150521bb0915e4b88)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No row is changed by this file.
-- Built by docs/gps-p0-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $state$
declare step text := 'undo GPS P0-3 (before)';
begin
  if to_regprocedure('public.watch_trip_gps(timestamptz)') is null
     or to_regprocedure('public.watch_trip_gps()') is not null
     or has_function_privilege('anon', 'public.watch_trip_gps(timestamptz)', 'execute')
     or has_function_privilege('authenticated', 'public.watch_trip_gps(timestamptz)', 'execute')
     or not exists (select 1 from pg_trigger where tgname = 'driver_locations_20_server_time' and tgenabled = 'O')
     or (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'trip_gps_watch'
          and column_name in ('trip_seen_at', 'quiet_kind', 'trip_silent_total', 'trip_alert_total')) <> 4
     or (select command from cron.job where jobname = 'watch-trip-gps') is distinct from 'select public.watch_trip_gps();' then
    raise exception '%: the P0-3 objects are not as expected - stop', step;
  end if;
end
$state$;

create temp table _rows on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x) as h;

-- ===== supabase/rollback/20261104150200_gps_watch_every_trip_undo.sql, verbatim =====
-- Undo 20261104150200_gps_watch_every_trip.sql: watch_trip_gps() exactly as
-- production had it before (md5 of pg_get_functiondef
-- 404c16209b42db87e6c4052a2091c143, captured 2026-11-04), trip_gps_watch with
-- its old columns, and positions stamped with the phone's clock again. The
-- cron job keeps calling "select public.watch_trip_gps();", which resolves to
-- the old function again, which only the server may run (as in production:
-- postgres and service_role). Nobody is told anything by this file.

drop trigger if exists driver_locations_20_server_time on public.driver_locations;
drop function if exists public.driver_locations_server_time();

drop function if exists public.watch_trip_gps(timestamptz);

CREATE OR REPLACE FUNCTION public.watch_trip_gps()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

alter table public.trip_gps_watch
  drop column if exists trip_seen_at,
  drop column if exists quiet_kind,
  drop column if exists trip_silent_total,
  drop column if exists trip_alert_total;
-- ===== end =====

do $after$
declare step text := 'undo GPS P0-3 (after)';
begin
  if to_regprocedure('public.watch_trip_gps()') is null
     or md5(pg_get_functiondef('public.watch_trip_gps()'::regprocedure)) <> '404c16209b42db87e6c4052a2091c143'
     or to_regprocedure('public.watch_trip_gps(timestamptz)') is not null
     or exists (select 1 from pg_trigger where tgname = 'driver_locations_20_server_time')
     or (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
          where table_schema = 'public' and table_name = 'trip_gps_watch')
        is distinct from 'driver_id,booking_id,quiet_since,silent_sent_at,silent_count,alert_sent_at,alert_count'
     or (select command from cron.job where jobname = 'watch-trip-gps') is distinct from 'select public.watch_trip_gps();' then
    raise exception '%: the GPS watch is not production''s of 2026-11-04 - stop', step;
  end if;
  if (select h from _rows) is distinct from (select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x)) then
    raise exception '%: rows of the GPS tables changed - stop', step;
  end if;
end
$after$;

delete from supabase_migrations.schema_migrations where version = '20261104150200' and name = 'gps_watch_every_trip';

select 'GPS P0-3 undone' as result, now() as at;
commit;
