-- KEKE GPS P0 - step 2 of 3: P0-2, sharing stops after the trip; the server checks the phone's clock
-- Source: supabase/migrations/20261104150100_gps_stop_sharing_after_trip.sql (md5 5d53fcbb8b8059415e5b5d6920f9337f)
-- Run as ONE call (Supabase SQL editor). It commits only if every check passes;
-- otherwise it rolls back and nothing changes. No row is changed by this file.
-- Built by docs/gps-p0-release/build.sh - do not edit by hand.

begin isolation level repeatable read;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $state$
declare step text := 'GPS P0-2 (before)';
begin
  if exists (select 1 from pg_trigger where not tgisinternal
               and tgrelid in ('public.driver_locations'::regclass, 'public.driver_location_trail'::regclass)
               and tgname <> 'driver_locations_20_server_time')
     or to_regclass('public.gps_device_clock') is not null
     or exists (select 1 from cron.job where jobname = 'gps-tidy-pins')
     or (select command from cron.job where jobname = 'trail-cleanup') is distinct from 'delete from public.driver_location_trail where recorded_at < now() - interval ''30 days'';' then
    raise exception '%: positions, road, clock table or jobs are not production''s of 2026-11-04 - stop', step;
  end if;
end
$state$;

create temp table _rows on commit drop as select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x) as h;

-- ===== supabase/migrations/20261104150100_gps_stop_sharing_after_trip.sql, verbatim =====
-- GPS P0-2: a driver's position stops being shared when his trip ends, also
-- for the app versions already installed; and the server, not the phone,
-- decides when a road point happened.
--
-- Today the phone stops sharing only when the trip is finished from the GPS
-- screen or the bookings list. Finished anywhere else - the hired driver's
-- panel, the day-by-day screen of a multi-day tour, KEKE ending it - the trip's
-- background task keeps running: it keeps writing the driver's position and
-- keeps adding points to the finished trip's road, which that trip's company
-- can read. The road takes the phone's own clock for when a point happened, so
-- a phone whose clock is behind can still put points from after the trip into
-- the finished trip's road. And the server never removed a position: 30 were
-- stored on 2026-11-04, none of them on a trip, the oldest from 27 September.
--
-- The app update fixes the phone side. This migration makes the server hold
-- the line for the app versions already installed, without ever answering
-- them with an error (an error would make an app's upload queue retry the
-- same points forever, lib/locationTrail.ts):
--
--   1. The phone's clock is checked. Every app version sends its own clock
--      with each position (updated_at); the server keeps, per driver, how far
--      it is from the server's clock (gps_device_clock - the server's own
--      table, no app can read or write it).
--   2. driver_location_trail: a driver's own point is stored only if it
--      belongs to his own trip (he is its driver) and
--        - the trip is in progress when the point arrives; if his phone's
--          clock is more than 2 minutes off, the point's time is corrected by
--          the measured difference; or
--        - the trip is completed, the point says it was recorded no later than
--          two minutes after the end, it arrives within 48 hours (a phone that
--          was offline), AND the phone's clock was checked from an hour before
--          the end until now and never found more than 2 minutes off. A clock
--          that is off, was off, or is unknown cannot place a late point
--          before the end, so such a point is not stored.
--      created_at is always the server's time of arrival. Anything else - a
--      finished trip's later points, a cancelled or declined booking, a job
--      not started, a point with no booking, the fleet owner's own phone on
--      his driver's trip - is skipped quietly (the insert "succeeds", nothing
--      is written).
--   3. driver_locations: a position the trip's background task sends
--      (gps_mode 'background', freshly stamped) while the driver has no trip
--      in progress is skipped the same way. Positions without a fresh mode
--      (apps from before 24 October 2026, the open GPS screen) are stored, and
--      nobody but the driver sees them outside a trip (P0-1).
--   4. gps_tidy_pins(), every 5 minutes: removes the position of a driver who
--      has no trip in progress if it came from a trip's background task, or if
--      it is older than 24 hours. Only positions (driver_locations): never a
--      road point, a passenger mark or a tour day.
--   5. The existing 30-day road clean-up (trail-cleanup) counts from when a
--      point reached the server, no longer from the phone's clock: a phone
--      whose clock is behind can no longer get its fresh points deleted.
--
-- The checks look only at a driver's own rows: anything else is left to the
-- row-level rules, which refuse it as before - so the answer never tells
-- anyone whether some driver is on a trip. None of the new functions can be
-- called by the apps (Supabase lets anon and authenticated execute every new
-- function in public unless told otherwise).
--
-- The first run of gps_tidy_pins() removes the positions left over today
-- (stored positions only, no booking changes; the GPS backup of 2026-11-04
-- can put them back). Nothing is sent to anyone.
--
-- Rollback: supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql

-- 1. the phone's clock -------------------------------------------------------------
create table if not exists public.gps_device_clock (
  driver_id uuid primary key references auth.users (id) on delete cascade,
  -- the phone's clock minus the server's, as last measured; kept steady (it
  -- moves only when the difference changes by more than 30 seconds), so a
  -- corrected time comes out the same when a phone sends a point twice
  skew interval not null,
  measured_at timestamptz not null,
  -- the last time the phone's clock was found more than 2 minutes off
  off_seen_at timestamptz
);
alter table public.gps_device_clock enable row level security;
revoke all on table public.gps_device_clock from public, anon, authenticated;
grant all on table public.gps_device_clock to service_role;

create or replace function public.driver_locations_device_clock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Someone else's row: the row-level rules decide, as before.
  if new.driver_id is distinct from auth.uid() then
    return new;
  end if;
  -- updated_at as the phone sent it is the phone's clock. No value, the
  -- server's own (a column default, or the server-time stamp of an upsert's
  -- second half) or an unchanged one says nothing about the phone.
  if new.updated_at is null or new.updated_at = now()
     or (tg_op = 'UPDATE' and new.updated_at is not distinct from old.updated_at) then
    return new;
  end if;
  begin
    insert into public.gps_device_clock as c (driver_id, skew, measured_at, off_seen_at)
    values (new.driver_id, new.updated_at - now(), now(),
            case when abs(extract(epoch from (new.updated_at - now()))) > 120 then now() end)
    on conflict (driver_id) do update
      set measured_at = excluded.measured_at,
          skew = case when abs(extract(epoch from (excluded.skew - c.skew))) > 30
                      then excluded.skew else c.skew end,
          off_seen_at = coalesce(excluded.off_seen_at, c.off_seen_at);
  exception when others then
    null;  -- the bookkeeping must never cost the driver his position
  end;
  return new;
end;
$$;
revoke all on function public.driver_locations_device_clock() from public, anon, authenticated;

drop trigger if exists driver_locations_15_device_clock on public.driver_locations;
create trigger driver_locations_15_device_clock
  before insert or update on public.driver_locations
  for each row execute function public.driver_locations_device_clock();

-- 2. the road: only points of a running or just-completed trip ---------------
create or replace function public.gps_trip_accepts_point(p_driver uuid, p_booking uuid, p_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_driver is not null and p_booking is not null and p_at is not null
     and exists (
       select 1 from public.bookings b
        where b.id = p_booking
          and b.driver_id = p_driver
          and (b.status = 'in_progress'
               or (b.status = 'completed'
                   and b.completed_at is not null
                   and p_at <= b.completed_at + interval '2 minutes'
                   and now() <= b.completed_at + interval '48 hours'
                   -- the phone's clock: checked from an hour before the end until
                   -- now, never found more than 2 minutes off
                   and exists (select 1 from public.gps_device_clock c
                                where c.driver_id = p_driver
                                  and c.measured_at >= b.completed_at - interval '1 hour'
                                  and abs(extract(epoch from c.skew)) <= 120
                                  and (c.off_seen_at is null
                                       or c.off_seen_at < b.completed_at - interval '1 hour'))))
     );
$$;
-- The server's own check (the trigger below runs it as the owner): no app may
-- call it to ask whether someone else's booking is under way.
revoke all on function public.gps_trip_accepts_point(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.gps_trip_accepts_point(uuid, uuid, timestamptz) to service_role;

create or replace function public.driver_location_trail_keep_trip_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_skew interval;
begin
  -- Someone else's row: the row-level rules decide (and refuse it), as before.
  if new.driver_id is distinct from auth.uid() then
    return new;
  end if;
  -- When the point reached the server is the server's to say.
  new.created_at := now();
  if not public.gps_trip_accepts_point(new.driver_id, new.booking_id, new.recorded_at) then
    return null;  -- skipped, not refused: an installed app must not retry it forever
  end if;
  -- A running trip's point from a phone whose clock is more than 2 minutes
  -- off (measured in the last 2 hours): its time is put right.
  select c.skew into v_skew
    from public.gps_device_clock c
   where c.driver_id = new.driver_id
     and c.measured_at > now() - interval '2 hours'
     and abs(extract(epoch from c.skew)) > 120;
  if v_skew is not null then
    new.recorded_at := new.recorded_at - v_skew;
  end if;
  return new;
end;
$$;
revoke all on function public.driver_location_trail_keep_trip_points() from public, anon, authenticated;

drop trigger if exists driver_location_trail_10_trip_points on public.driver_location_trail;
create trigger driver_location_trail_10_trip_points
  before insert on public.driver_location_trail
  for each row execute function public.driver_location_trail_keep_trip_points();

-- 3. the live position: a trip's background report needs a trip ---------------
create or replace function public.driver_locations_trip_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Someone else's row: the row-level rules decide (and refuse it), as before.
  if new.driver_id is distinct from auth.uid() then
    return new;
  end if;
  -- A fresh report from a trip's background task carries gps_mode
  -- 'background' and a new gps_mode_at. Writes without a fresh mode (older
  -- apps, the open GPS screen) pass untouched.
  if new.gps_mode = 'background'
     and (tg_op = 'INSERT' or new.gps_mode_at is distinct from old.gps_mode_at)
     and not exists (select 1 from public.bookings b
                      where b.status = 'in_progress'
                        and (b.driver_id = new.driver_id or b.host_driver_id = new.driver_id)) then
    return null;  -- skipped, not refused
  end if;
  return new;
end;
$$;
revoke all on function public.driver_locations_trip_guard() from public, anon, authenticated;

drop trigger if exists driver_locations_10_trip_guard on public.driver_locations;
create trigger driver_locations_10_trip_guard
  before insert or update on public.driver_locations
  for each row execute function public.driver_locations_trip_guard();

-- 4. positions left over from finished trips, and old ones ---------------------
create or replace function public.gps_tidy_pins(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.driver_locations dl
   where not exists (select 1 from public.bookings b
                      where b.status = 'in_progress'
                        and (b.driver_id = dl.driver_id or b.host_driver_id = dl.driver_id))
     and (dl.gps_mode = 'background' or dl.updated_at < p_now - interval '24 hours');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.gps_tidy_pins(timestamptz) from public, anon, authenticated;
grant execute on function public.gps_tidy_pins(timestamptz) to service_role;

-- 5. the schedules ----------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('gps-tidy-pins', '*/5 * * * *', 'select public.gps_tidy_pins();');
    if exists (select 1 from cron.job where jobname = 'trail-cleanup') then
      perform cron.schedule('trail-cleanup', '17 3 * * *',
        'delete from public.driver_location_trail where created_at < now() - interval ''30 days'';');
    end if;
  else
    raise notice 'pg_cron is not installed here: gps-tidy-pins is not scheduled';
  end if;
end
$cron$;
-- ===== end =====

do $after$
declare step text := 'GPS P0-2 (after)';
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
  if (select h from _rows) is distinct from (select (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.driver_id), '')) from public.driver_locations x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.driver_location_trail x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.trip_events x)
    || '|' || (select count(*) || ':' || md5(coalesce(string_agg(to_jsonb(x)::text, ',' order by x.id), '')) from public.booking_day_logs x)) then
    raise exception '%: rows of the GPS tables changed - stop', step;
  end if;
end
$after$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261104150100', 'gps_stop_sharing_after_trip', array['-- applied from supabase/migrations/20261104150100_gps_stop_sharing_after_trip.sql by docs/gps-p0-release'], 'gps-p0-release');

select 'GPS P0-2 applied (the tidy job runs within 5 minutes)' as result, now() as at;
commit;
