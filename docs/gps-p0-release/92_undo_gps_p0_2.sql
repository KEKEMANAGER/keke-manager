-- KEKE GPS P0 - UNDO P0-2
-- Source: supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql (md5 087e1321837cebbed063ad84fa3ecc39)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No row is changed by this file.
-- Built by docs/gps-p0-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $state$
declare step text := 'undo GPS P0-2 (before)';
begin
  if (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O'
        and tgname in ('driver_locations_10_trip_guard', 'driver_locations_15_device_clock', 'driver_location_trail_10_trip_points')) <> 3
     or to_regclass('public.gps_device_clock') is null
     or not (select relrowsecurity from pg_class where oid = 'public.gps_device_clock'::regclass)
     or has_table_privilege('authenticated', 'public.gps_device_clock', 'select')
     or has_table_privilege('anon', 'public.gps_device_clock', 'select')
     or exists (select 1 from unnest(array['public.gps_trip_accepts_point(uuid,uuid,timestamptz)', 'public.driver_location_trail_keep_trip_points()',
                                        'public.driver_locations_trip_guard()', 'public.driver_locations_device_clock()',
                                        'public.gps_tidy_pins(timestamptz)']) f, unnest(array['anon', 'authenticated']) r
                 where has_function_privilege(r, f, 'execute'))
     or (select schedule || ' ' || command from cron.job where jobname = 'gps-tidy-pins') is distinct from '*/5 * * * * select public.gps_tidy_pins();'
     or (select command from cron.job where jobname = 'trail-cleanup') is distinct from 'delete from public.driver_location_trail where created_at < now() - interval ''30 days'';' then
    raise exception '%: the P0-2 objects are not as expected - stop', step;
  end if;
end
$state$;

create temp table _rows on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x) as h;

-- ===== supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql, verbatim =====
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
-- ===== end =====

do $after$
declare step text := 'undo GPS P0-2 (after)';
begin
  if exists (select 1 from pg_trigger where not tgisinternal
               and tgrelid in ('public.driver_locations'::regclass, 'public.driver_location_trail'::regclass)
               and tgname <> 'driver_locations_20_server_time')
     or to_regclass('public.gps_device_clock') is not null
     or exists (select 1 from cron.job where jobname = 'gps-tidy-pins')
     or (select command from cron.job where jobname = 'trail-cleanup') is distinct from 'delete from public.driver_location_trail where recorded_at < now() - interval ''30 days'';' then
    raise exception '%: positions, road, clock table or jobs are not production''s of 2026-11-04 - stop', step;
  end if;
  if (select h from _rows) is distinct from (select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x)) then
    raise exception '%: rows of the GPS tables changed - stop', step;
  end if;
end
$after$;

delete from supabase_migrations.schema_migrations where version = '20261104150100' and name = 'gps_stop_sharing_after_trip';

select 'GPS P0-2 undone' as result, now() as at;
commit;
