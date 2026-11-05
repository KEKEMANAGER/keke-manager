-- KEKE GPS P0 - step 1 of 3: P0-1, who sees a driver
-- Source: supabase/migrations/20261104150000_gps_position_only_during_trip.sql (md5 a1fb4005137e280407cd7531fd33f7d0)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No row is changed by this file.
-- Built by docs/gps-p0-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $state$
declare step text := 'GPS P0-1 (before)';
begin
  if (select count(*) from (values ('driver_locations','driver_locations_company_booking_read','8ad9d669e756c76ed04f307c11ee41c1'),
    ('driver_locations','driver_locations_fleet_host_read','9c393869a27ca520d9d767924909296a'),
    ('driver_locations','driver_locations_admin_read','a8889e5322f8467f00a2b22b9827e4a1')) v(t, p, h)
       join pg_policies q on q.schemaname = 'public' and q.tablename = v.t and q.policyname = v.p and md5(coalesce(q.qual, '')) = v.h) <> 3
     or (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'driver_locations')
        is distinct from 'driver_locations_admin_read,driver_locations_company_booking_read,driver_locations_fleet_host_read,driver_locations_self' then
    raise exception '%: the read rules of driver positions are not production''s of 2026-11-04 - stop', step;
  end if;
  if to_regprocedure('public.gps_fleet_owner_sees(uuid)') is not null or to_regprocedure('public.gps_admin_open_access(uuid,text,integer)') is not null then
    raise exception '%: P0-1 objects exist already - stop', step;
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

-- ===== supabase/migrations/20261104150000_gps_position_only_during_trip.sql, verbatim =====
-- GPS P0-1: where a driver is can be seen by others only while he drives a
-- trip in progress - by the trip's company, his fleet owner and KEKE's admins.
-- Whatever app version the driver has.
--
-- Production let a company read a driver's live position (driver_locations)
-- whenever it had ANY booking with him that was not cancelled or declined: a
-- trip finished weeks ago, a request he never accepted, a job for next month.
-- On 2026-11-04 three companies could read two drivers' positions through
-- finished bookings alone. A fleet owner read his drivers' positions at any
-- time, and KEKE's admins every driver's, also long after a trip had ended:
-- the app versions already installed keep sending after a trip (P0-2), and the
-- database showed it. Who sees a position is now decided by the trip, never by
-- what the phone still sends:
--
--   * a company: the driver of its own booking that is in progress;
--   * a fleet owner: his driver while that driver has a trip in progress (one
--     of his drivers - driver_fleet, accepted - or a trip he gave out:
--     bookings.host_driver_id); not before, not after, not between trips;
--   * KEKE's admins: a driver while he has a trip in progress. The one
--     exception, for safety or support: an admin opens access to ONE driver's
--     position with gps_admin_open_access(driver, reason, minutes) - a reason
--     of at least 10 characters, at most 60 minutes, only for himself. Every
--     opening is kept in gps_admin_access (who, whom, why, when, until when);
--     admins can read that log, nobody can change or delete it through the
--     app, and gps_admin_close_access(driver) ends it early;
--   * the driver himself: always (unchanged).
--
-- A convoy's coordinator row (bookings.is_group_master) is never a trip here:
-- it has no driver of its own - its cars do - and the booking rules let its
-- company set its status itself, so a company could otherwise name any driver
-- on one, mark it "in progress" and see him.
--
-- The road (driver_location_trail) - what is stored and who reads it - is
-- P0-2's.
--
-- Realtime sends a person only the rows these rules let him read (inserts and
-- updates; Supabase sends deletes to every subscriber as the bare key, which
-- is the driver's id). Nothing is deleted or rewritten here; only who may
-- read changes.
--
-- Rollback: supabase/rollback/20261104150000_gps_position_only_during_trip_undo.sql

-- the company -------------------------------------------------------------------
drop policy if exists driver_locations_company_booking_read on public.driver_locations;
create policy driver_locations_company_booking_read on public.driver_locations
  as permissive for select to authenticated
  using (
    exists (select 1 from public.users u
             where u.id = auth.uid() and u.role = 'company')
    and exists (select 1 from public.bookings b
                 where b.company_id = auth.uid()
                   and b.driver_id = driver_locations.driver_id
                   and b.status = 'in_progress'
                   and b.is_group_master is not true)
  );

-- the fleet owner -----------------------------------------------------------------
-- A trip his driver took himself is not one the fleet owner may read (the
-- bookings rules), so the check runs as the owner of this function. It answers
-- only about the person asking: true just when the driver is on a trip in
-- progress and the asker is his fleet owner or gave him that trip.
create or replace function public.gps_fleet_owner_sees(p_driver uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (select 1 from public.bookings b
                  where b.status = 'in_progress'
                    and b.driver_id = p_driver
                    and b.is_group_master is not true
                    and (b.host_driver_id = auth.uid()
                         or exists (select 1 from public.driver_fleet f
                                     where f.host_driver_id = auth.uid()
                                       and f.sub_driver_id = p_driver
                                       and f.status = 'accepted')));
$$;
revoke all on function public.gps_fleet_owner_sees(uuid) from public, anon, authenticated;
grant execute on function public.gps_fleet_owner_sees(uuid) to authenticated, service_role;

drop policy if exists driver_locations_fleet_host_read on public.driver_locations;
create policy driver_locations_fleet_host_read on public.driver_locations
  as permissive for select to authenticated
  using (public.gps_fleet_owner_sees(driver_locations.driver_id));

-- KEKE's admins, and their one exception ----------------------------------------
create table if not exists public.gps_admin_access (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  driver_id uuid not null,
  reason text not null,
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  constraint gps_admin_access_reason_check check (char_length(btrim(reason)) between 10 and 500),
  constraint gps_admin_access_window_check check (expires_at > opened_at and expires_at <= opened_at + interval '60 minutes')
);
-- A log, not a link: it stays when an account is deleted, so no foreign keys.
create index if not exists gps_admin_access_open_idx on public.gps_admin_access (driver_id, admin_id, expires_at);
alter table public.gps_admin_access enable row level security;
revoke all on table public.gps_admin_access from public, anon, authenticated;
grant select on table public.gps_admin_access to authenticated;
grant all on table public.gps_admin_access to service_role;
revoke all on sequence public.gps_admin_access_id_seq from public, anon, authenticated;
drop policy if exists gps_admin_access_admin_read on public.gps_admin_access;
create policy gps_admin_access_admin_read on public.gps_admin_access
  as permissive for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin'));

create or replace function public.gps_admin_open_access(p_driver uuid, p_reason text, p_minutes integer default 30)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_until timestamptz;
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin') then
    raise exception 'only a KEKE admin can open a driver''s position' using errcode = '42501';
  end if;
  if p_driver is null or not exists (select 1 from public.users u where u.id = p_driver and u.role = 'driver') then
    raise exception 'no such driver' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 10 or char_length(btrim(p_reason)) > 500 then
    raise exception 'say why, in 10 to 500 characters' using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 60 then
    raise exception 'between 1 and 60 minutes' using errcode = '22023';
  end if;
  v_until := now() + make_interval(mins => p_minutes);
  insert into public.gps_admin_access (admin_id, driver_id, reason, opened_at, expires_at)
  values (auth.uid(), p_driver, btrim(p_reason), now(), v_until);
  return v_until;
end;
$$;
revoke all on function public.gps_admin_open_access(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.gps_admin_open_access(uuid, text, integer) to authenticated, service_role;

create or replace function public.gps_admin_close_access(p_driver uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n integer;
begin
  if not exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin') then
    raise exception 'only a KEKE admin can close it' using errcode = '42501';
  end if;
  update public.gps_admin_access
     set closed_at = now()
   where admin_id = auth.uid() and driver_id = p_driver and closed_at is null and expires_at > now();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.gps_admin_close_access(uuid) from public, anon, authenticated;
grant execute on function public.gps_admin_close_access(uuid) to authenticated, service_role;

drop policy if exists driver_locations_admin_read on public.driver_locations;
create policy driver_locations_admin_read on public.driver_locations
  as permissive for select to authenticated
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
    and (exists (select 1 from public.bookings b
                  where b.status = 'in_progress' and b.driver_id = driver_locations.driver_id
                    and b.is_group_master is not true)
         or exists (select 1 from public.gps_admin_access g
                     where g.admin_id = auth.uid()
                       and g.driver_id = driver_locations.driver_id
                       and g.closed_at is null
                       and g.expires_at > now()))
  );
-- ===== end =====

do $after$
declare step text := 'GPS P0-1 (after)';
begin
  if (select count(*) from pg_policies q where q.schemaname = 'public'
        and q.policyname in ('driver_locations_company_booking_read', 'driver_locations_admin_read')
        and q.qual like '%in_progress%' and q.qual like '%is_group_master%') <> 2
     or not exists (select 1 from pg_policies q where q.schemaname = 'public' and q.policyname = 'driver_locations_fleet_host_read'
                     and q.qual like '%gps_fleet_owner_sees%')
     or (select string_agg(policyname, ',' order by policyname) from pg_policies where schemaname = 'public' and tablename = 'driver_locations')
        is distinct from 'driver_locations_admin_read,driver_locations_company_booking_read,driver_locations_fleet_host_read,driver_locations_self'
     or to_regprocedure('public.gps_fleet_owner_sees(uuid)') is null
     or to_regprocedure('public.gps_admin_open_access(uuid,text,integer)') is null
     or to_regprocedure('public.gps_admin_close_access(uuid)') is null
     or to_regclass('public.gps_admin_access') is null
     or not coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.gps_admin_access')), false)
     or has_function_privilege('anon', 'public.gps_admin_open_access(uuid,text,integer)', 'execute')
     or has_function_privilege('anon', 'public.gps_fleet_owner_sees(uuid)', 'execute')
     or has_table_privilege('anon', 'public.gps_admin_access', 'select')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'insert')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'update')
     or has_table_privilege('authenticated', 'public.gps_admin_access', 'delete') then
    raise exception '%: the P0-1 rules are not as expected - stop', step;
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

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261104150000', 'gps_position_only_during_trip', array['-- applied from supabase/migrations/20261104150000_gps_position_only_during_trip.sql by docs/gps-p0-release'], 'gps-p0-release');

select 'GPS P0-1 applied' as result, now() as at;
commit;
