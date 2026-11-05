-- KEKE GPS P0 - UNDO P0-2
-- Source: supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql (md5 9ed8b889d0079e8a42c8bdec008a7498)
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
        and tgname in ('driver_locations_05_device_clock', 'driver_locations_10_trip_guard', 'driver_location_trail_10_trip_points',
                       'bookings_gps_trip_start')) <> 4
     or (select count(*) from pg_policies q where q.schemaname = 'public' and q.tablename = 'driver_location_trail'
          and q.policyname in ('driver_location_trail_company_read', 'driver_location_trail_fleet_host_read', 'driver_location_trail_admin_read')
          and q.qual like '%gps_road_point_visible%') <> 3
     or (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'driver_location_trail')
        is distinct from 'driver_location_trail_admin_read,driver_location_trail_company_read,driver_location_trail_driver_insert,driver_location_trail_driver_read,driver_location_trail_fleet_host_read'
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'driver_location_trail' and column_name = 'trip_check')
     or to_regclass('public.gps_device_clock') is null or to_regclass('public.gps_skip_counts') is null
     or to_regclass('public.gps_trip_start') is null
     or exists (select 1 from pg_class where oid in (to_regclass('public.gps_device_clock'), to_regclass('public.gps_skip_counts'),
                                                     to_regclass('public.gps_trip_start')) and not relrowsecurity)
     or exists (select 1 from unnest(array['public.gps_device_clock', 'public.gps_skip_counts', 'public.gps_trip_start']) t, unnest(array['anon', 'authenticated']) r,
                     unnest(array['select', 'insert', 'update', 'delete']) p where has_table_privilege(r, t, p))
     or (select string_agg(f, ',' order by f collate "C")
           from (select p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as f from pg_proc p
                  where p.pronamespace = 'public'::regnamespace and p.proname in ('gps_count_skip', 'driver_locations_device_clock', 'gps_road_point_kind', 'gps_trip_accepts_point',
                    'driver_location_trail_keep_trip_points', 'gps_backfill_trip_check', 'gps_road_point_visible',
                    'driver_locations_trip_guard', 'gps_tidy_pins', 'bookings_gps_trip_start')) x)
        is distinct from 'bookings_gps_trip_start(),driver_location_trail_keep_trip_points(),driver_locations_device_clock(),driver_locations_trip_guard(),gps_count_skip(text, uuid),gps_road_point_kind(uuid, uuid, timestamp with time zone),gps_road_point_visible(text, bigint),gps_tidy_pins(timestamp with time zone)'
     or exists (select 1 from unnest(array['public.gps_road_point_kind(uuid,uuid,timestamptz)', 'public.driver_location_trail_keep_trip_points()',
                                        'public.driver_locations_trip_guard()', 'public.driver_locations_device_clock()',
                                        'public.gps_tidy_pins(timestamptz)', 'public.gps_count_skip(text,uuid)',
                                        'public.bookings_gps_trip_start()']) f, unnest(array['anon', 'authenticated']) r
                 where has_function_privilege(r, f, 'execute'))
     or has_function_privilege('anon', 'public.gps_road_point_visible(text,bigint)', 'execute')
     or not has_function_privilege('authenticated', 'public.gps_road_point_visible(text,bigint)', 'execute')
     or to_regclass('public.driver_location_trail_created_idx') is null
     or (select schedule || ' ' || command from cron.job where jobname = 'gps-tidy-pins') is distinct from '*/5 * * * * select public.gps_tidy_pins();'
     or (select command from cron.job where jobname = 'trail-cleanup') is distinct from 'delete from public.driver_location_trail where created_at < now() - interval ''30 days'';' then
    raise exception '%: the P0-2 objects are not as expected - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
$state$;

create temp table _rows on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg((x.id, x.driver_id, x.booking_id, x.recorded_at, x.latitude, x.longitude, x.created_at)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x) as h;

-- ===== supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql, verbatim =====
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
-- ===== end =====

do $after$
declare step text := 'undo GPS P0-2 (after)';
begin
  if (select count(*) from (values ('driver_location_trail','driver_location_trail_company_read','f5bdff939db84023dc2b17c2d07ab05a'),
    ('driver_location_trail','driver_location_trail_fleet_host_read','9d6cc7b9d05fd40e122728721bad8077'),
    ('driver_location_trail','driver_location_trail_admin_read','21596870c5ee5a2a50a4de36d42ffa21')) v(t, p, h)
       join pg_policies q on q.schemaname = 'public' and q.tablename = v.t and q.policyname = v.p and md5(coalesce(q.qual, '')) = v.h) <> 3
     or (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'driver_location_trail')
        is distinct from 'driver_location_trail_admin_read,driver_location_trail_company_read,driver_location_trail_driver_insert,driver_location_trail_driver_read,driver_location_trail_fleet_host_read'
     or exists (select 1 from pg_trigger where not tgisinternal
               and tgrelid in ('public.driver_locations'::regclass, 'public.driver_location_trail'::regclass)
               and tgname <> 'driver_locations_20_server_time')
     or to_regclass('public.gps_device_clock') is not null
     or to_regclass('public.gps_skip_counts') is not null
     or to_regclass('public.gps_trip_start') is not null
     or exists (select 1 from pg_trigger where tgname = 'bookings_gps_trip_start')
     or to_regclass('public.driver_location_trail_created_idx') is not null
     or exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('gps_count_skip', 'driver_locations_device_clock', 'gps_road_point_kind', 'gps_trip_accepts_point',
                    'driver_location_trail_keep_trip_points', 'gps_backfill_trip_check', 'gps_road_point_visible',
                    'driver_locations_trip_guard', 'gps_tidy_pins', 'bookings_gps_trip_start'))
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'driver_location_trail' and column_name = 'trip_check')
     or exists (select 1 from cron.job where jobname = 'gps-tidy-pins')
     or (select command from cron.job where jobname = 'trail-cleanup') is distinct from 'delete from public.driver_location_trail where recorded_at < now() - interval ''30 days'';' then
    raise exception '%: road rules, positions, clock or jobs are not production''s of 2026-11-04 - stop', step;
  end if;
  if (select h from _rows) is distinct from (select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg((x.id, x.driver_id, x.booking_id, x.recorded_at, x.latitude, x.longitude, x.created_at)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x)) then
    raise exception '%: rows of the GPS tables changed - stop', step;
  end if;
exception when others then
  if sqlerrm like '%- stop' then raise; end if;
  raise exception '%: not as expected (%) - stop', step, sqlerrm;
end
$after$;

delete from supabase_migrations.schema_migrations where version = '20261104150100' and name = 'gps_stop_sharing_after_trip';

select 'GPS P0-2 undone' as result, now() as at;
commit;
