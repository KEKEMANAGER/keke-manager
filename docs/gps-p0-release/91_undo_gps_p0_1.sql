-- KEKE GPS P0 - UNDO P0-1
-- Source: supabase/rollback/20261104150000_gps_position_only_during_trip_undo.sql (md5 4cded1a47e9f097da5ef30ae1f960b8b)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No row is changed by this file.
-- Built by docs/gps-p0-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $state$
declare step text := 'undo GPS P0-1 (before)';
begin
  if (select count(*) from pg_policies q where q.schemaname = 'public'
        and q.policyname in ('driver_locations_company_booking_read', 'driver_locations_admin_read') and q.qual like '%in_progress%') <> 2
     or not exists (select 1 from pg_policies q where q.schemaname = 'public' and q.policyname = 'driver_locations_fleet_host_read'
                     and q.qual like '%gps_fleet_owner_sees%')
     or (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'driver_locations')
        is distinct from 'driver_locations_admin_read,driver_locations_company_booking_read,driver_locations_fleet_host_read,driver_locations_self'
     or to_regprocedure('public.gps_fleet_owner_sees(uuid)') is null
     or to_regprocedure('public.gps_admin_open_access(uuid,text,integer)') is null
     or to_regprocedure('public.gps_admin_close_access(uuid)') is null
     or to_regclass('public.gps_admin_access') is null
     or not (select relrowsecurity from pg_class where oid = 'public.gps_admin_access'::regclass)
     or has_function_privilege('anon', 'public.gps_admin_open_access(uuid,text,integer)', 'execute')
     or has_function_privilege('anon', 'public.gps_fleet_owner_sees(uuid)', 'execute')
     or has_table_privilege('anon', 'public.gps_admin_access', 'select')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'insert')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'update')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'delete') then
    raise exception '%: the P0-1 rules are not as expected - stop', step;
  end if;
end
$state$;

create temp table _rows on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg((x.id, x.driver_id, x.booking_id, x.recorded_at, x.latitude, x.longitude, x.created_at)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x) as h;

-- ===== supabase/rollback/20261104150000_gps_position_only_during_trip_undo.sql, verbatim =====
-- Undo 20261104150000_gps_position_only_during_trip.sql: the three read rules
-- of the live position exactly as production had them before (captured 2026-11-04,
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
-- ===== end =====

do $after$
declare step text := 'undo GPS P0-1 (after)';
begin
  if (select count(*) from (values ('driver_locations','driver_locations_company_booking_read','8ad9d669e756c76ed04f307c11ee41c1'),
    ('driver_locations','driver_locations_fleet_host_read','9c393869a27ca520d9d767924909296a'),
    ('driver_locations','driver_locations_admin_read','a8889e5322f8467f00a2b22b9827e4a1')) v(t, p, h)
       join pg_policies q on q.schemaname = 'public' and q.tablename = v.t and q.policyname = v.p and md5(coalesce(q.qual, '')) = v.h) <> 3
     or (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'driver_locations')
        is distinct from 'driver_locations_admin_read,driver_locations_company_booking_read,driver_locations_fleet_host_read,driver_locations_self' then
    raise exception '%: the read rules of driver positions are not production''s of 2026-11-04 - stop', step;
  end if;
  if (select h from _rows) is distinct from (select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg((x.id, x.driver_id, x.booking_id, x.recorded_at, x.latitude, x.longitude, x.created_at)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x)) then
    raise exception '%: rows of the GPS tables changed - stop', step;
  end if;
end
$after$;

delete from supabase_migrations.schema_migrations where version = '20261104150000' and name = 'gps_position_only_during_trip';

select 'GPS P0-1 undone' as result, now() as at;
commit;
