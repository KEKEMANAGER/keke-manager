-- GPS P0-2: a driver's position stops being shared when his trip ends, also
-- for the app versions already installed; the road holds only the trip, timed
-- by the server; and nobody but the driver reads a road point from outside it.
--
-- Today the phone stops sharing only when the trip is finished from the GPS
-- screen or the bookings list. Finished anywhere else - the hired driver's
-- panel, the day-by-day screen of a multi-day tour, KEKE ending it - the trip's
-- background task keeps running: it keeps writing the driver's position and
-- keeps adding points to the finished trip's road, which that trip's company,
-- the driver's fleet owner and KEKE's admins can read. The road takes the
-- phone's own clock for when a point happened, so a phone whose clock is
-- behind can still put points from after the trip into the finished trip's
-- road. And the server never removed a position: 30 were stored on
-- 2026-11-04, none of them on a trip, the oldest from 27 September.
--
-- The app update fixes the phone side. This migration makes the server hold
-- the line for the app versions already installed, without ever answering
-- them with an error (an error would make an app's upload queue retry the
-- same points forever, lib/locationTrail.ts):
--
--   1. The phone's clock is checked. Every app version sends its own clock
--      with each position report (updated_at); the server notes, per driver,
--      how far it is from the server's clock and when it was last found more
--      than 2 minutes off (gps_device_clock - the server's own table, no app
--      can read or write it). Every report counts, also one that is not
--      stored (below).
--   2. driver_location_trail: a driver's own point is stored only for his own
--      trip (he is its driver), not from before its planned start (12 hours of
--      slack) nor older than 31 days, and
--        - while the trip is in progress ("trip"), or
--        - for his completed trip, sent late ("late"): recorded no later than
--          two minutes after the end, arriving within 48 hours (a phone that
--          was offline), and only if his phone's clock was not found more
--          than 2 minutes off from an hour before the end until now. A clock
--          known to be off cannot place a late point before the end.
--      created_at is always the server's time of arrival; trip_check says
--      which of the two let the point in. Anything else - a finished trip's
--      later points, a cancelled or declined booking, a job not started, a
--      point with no booking, the fleet owner's own phone on his driver's
--      trip - is skipped quietly (the insert "succeeds", nothing is written)
--      and counted in gps_skip_counts, so a rollout can watch what is skipped.
--   3. Who reads the road: the trip's company, the fleet owner (his driver's
--      trip, or a trip he gave out) and KEKE's admins read only points the
--      server checked - while the trip runs; afterwards those that arrived
--      during it (or up to two minutes after the end) and the checked late
--      ones; for a trip cancelled under way, those that arrived before the
--      cancellation. Never a point from after the trip, never an unchecked
--      one (stored before this migration). The driver reads all of his own.
--   4. driver_locations: a position the trip's background task sends
--      (gps_mode 'background', freshly stamped) while the driver has no trip
--      in progress is skipped the same way. Positions without a fresh mode
--      (apps from before 24 October 2026, the open GPS screen) are stored, and
--      nobody but the driver sees them outside a trip (P0-1).
--   5. gps_tidy_pins(), every 5 minutes: removes the position of a driver who
--      has no trip in progress if it came from a trip's background task, or if
--      it is older than 15 minutes - so the next trip never starts with an old
--      one. Only positions (driver_locations): never a road point, a passenger
--      mark or a tour day.
--   6. The existing 30-day road clean-up (trail-cleanup) no longer deletes a
--      trip's road: only points that were never checked or have no trip. How
--      long trip roads are kept is the owner's decision (retention period);
--      until it is set, they are kept.
--
-- The checks look only at a driver's own rows: anything else is left to the
-- row-level rules, which refuse it as before - so the answer never tells
-- anyone whether some driver is on a trip. None of the new functions can be
-- called by the apps (Supabase lets anon and authenticated execute every new
-- function in public unless told otherwise), except the read check of point
-- 3, which the read rules need and which answers only about the asker's own
-- trips.
--
-- The first run of gps_tidy_pins() removes the positions left over today
-- (stored positions only, no booking changes; the GPS backup of 2026-11-04
-- can put them back). Nothing is sent to anyone.
--
-- Rollback: supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql

-- 0. what was skipped, by day: for watching a rollout ---------------------------
create table if not exists public.gps_skip_counts (
  day date not null,
  kind text not null,
  n bigint not null default 0,
  primary key (day, kind)
);
alter table public.gps_skip_counts enable row level security;
revoke all on table public.gps_skip_counts from public, anon, authenticated;
grant all on table public.gps_skip_counts to service_role;

create or replace function public.gps_count_skip(p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gps_skip_counts as s (day, kind, n)
  values ((now() at time zone 'Asia/Tbilisi')::date, p_kind, 1)
  on conflict (day, kind) do update set n = s.n + 1;
exception when others then
  null;  -- counting must never cost the driver anything
end;
$$;
revoke all on function public.gps_count_skip(text) from public, anon, authenticated;

-- 1. the phone's clock -------------------------------------------------------------
create table if not exists public.gps_device_clock (
  driver_id uuid primary key references auth.users (id) on delete cascade,
  -- the phone's clock minus the server's, as last measured; kept steady (it
  -- moves only when the difference changes by more than 30 seconds)
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

-- First among the position's triggers: a report that is then skipped (no trip)
-- still says what the phone's clock is.
drop trigger if exists driver_locations_15_device_clock on public.driver_locations;
drop trigger if exists driver_locations_05_device_clock on public.driver_locations;
create trigger driver_locations_05_device_clock
  before insert or update on public.driver_locations
  for each row execute function public.driver_locations_device_clock();

-- 2. the road: only points of the driver's running or just-completed trip ------
alter table public.driver_location_trail
  add column if not exists trip_check text;
alter table public.driver_location_trail
  drop constraint if exists driver_location_trail_trip_check_check;
alter table public.driver_location_trail
  add constraint driver_location_trail_trip_check_check check (trip_check in ('trip', 'late'));
create index if not exists driver_location_trail_created_idx on public.driver_location_trail (created_at);

drop function if exists public.gps_trip_accepts_point(uuid, uuid, timestamptz);
create or replace function public.gps_road_point_kind(p_driver uuid, p_booking uuid, p_at timestamptz)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when b.status = 'in_progress' then 'trip'
           when b.status = 'completed'
                and b.completed_at is not null
                and p_at <= b.completed_at + interval '2 minutes'
                and now() <= b.completed_at + interval '48 hours'
                and not exists (select 1 from public.gps_device_clock c
                                 where c.driver_id = p_driver
                                   and (abs(extract(epoch from c.skew)) > 120
                                        or c.off_seen_at >= b.completed_at - interval '1 hour'))
             then 'late'
         end
    from public.bookings b
   where p_driver is not null and p_at is not null
     and b.id = p_booking
     and b.driver_id = p_driver
     and p_at >= greatest(public.parse_booking_start_ts(b.date_display) - interval '12 hours',
                          coalesce(b.completed_at, now()) - interval '31 days');
$$;
-- The server's own check (the trigger below runs it as the owner): no app may
-- call it to ask whether someone else's booking is under way.
revoke all on function public.gps_road_point_kind(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.gps_road_point_kind(uuid, uuid, timestamptz) to service_role;

create or replace function public.driver_location_trail_keep_trip_points()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_kind text;
begin
  -- Someone else's row: the row-level rules decide (and refuse it), as before.
  if new.driver_id is distinct from auth.uid() then
    return new;
  end if;
  -- When the point reached the server is the server's to say.
  new.created_at := now();
  v_kind := public.gps_road_point_kind(new.driver_id, new.booking_id, new.recorded_at);
  if v_kind is null then
    perform public.gps_count_skip('road_point');
    return null;  -- skipped, not refused: an installed app must not retry it forever
  end if;
  new.trip_check := v_kind;
  return new;
end;
$$;
revoke all on function public.driver_location_trail_keep_trip_points() from public, anon, authenticated;

drop trigger if exists driver_location_trail_10_trip_points on public.driver_location_trail;
create trigger driver_location_trail_10_trip_points
  before insert on public.driver_location_trail
  for each row execute function public.driver_location_trail_keep_trip_points();

-- 3. who reads the road ------------------------------------------------------------
-- Answers only about the asker: whether this checked point of this booking is
-- one he may read as the trip's company, its fleet owner or an admin.
create or replace function public.gps_road_point_visible(p_as text, p_booking uuid, p_created timestamptz, p_check text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and p_booking is not null and p_check is not null
     and exists (
       select 1 from public.bookings b
        where b.id = p_booking
          and case p_as
                when 'company' then b.company_id = auth.uid()
                when 'fleet' then b.host_driver_id = auth.uid()
                                  or exists (select 1 from public.driver_fleet f
                                              where f.host_driver_id = auth.uid()
                                                and f.sub_driver_id = b.driver_id
                                                and f.status = 'accepted')
                when 'admin' then exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
                else false
              end
          and (b.status = 'in_progress'
               or (b.status = 'completed' and b.completed_at is not null
                   and (p_check = 'late'
                        or p_created <= b.completed_at + interval '2 minutes'))
               or (b.status = 'cancelled' and b.cancelled_at is not null
                   and p_check = 'trip'
                   and p_created <= b.cancelled_at + interval '2 minutes')));
$$;
revoke all on function public.gps_road_point_visible(text, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.gps_road_point_visible(text, uuid, timestamptz, text) to authenticated, service_role;

drop policy if exists driver_location_trail_company_read on public.driver_location_trail;
create policy driver_location_trail_company_read on public.driver_location_trail
  as permissive for select to authenticated
  using (public.gps_road_point_visible('company', booking_id, created_at, trip_check));

drop policy if exists driver_location_trail_fleet_host_read on public.driver_location_trail;
create policy driver_location_trail_fleet_host_read on public.driver_location_trail
  as permissive for select to authenticated
  using (public.gps_road_point_visible('fleet', booking_id, created_at, trip_check));

drop policy if exists driver_location_trail_admin_read on public.driver_location_trail;
create policy driver_location_trail_admin_read on public.driver_location_trail
  as permissive for select to authenticated
  using (public.gps_road_point_visible('admin', booking_id, created_at, trip_check));

-- 4. the live position: a trip's background report needs a trip ---------------
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
    perform public.gps_count_skip('background_position');
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

-- 5. positions left over from finished trips, and old ones ---------------------
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
     and (dl.gps_mode = 'background' or dl.updated_at < p_now - interval '15 minutes');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.gps_tidy_pins(timestamptz) from public, anon, authenticated;
grant execute on function public.gps_tidy_pins(timestamptz) to service_role;

-- 6. the schedules ----------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('gps-tidy-pins', '*/5 * * * *', 'select public.gps_tidy_pins();');
    if exists (select 1 from cron.job where jobname = 'trail-cleanup') then
      perform cron.schedule('trail-cleanup', '17 3 * * *',
        'delete from public.driver_location_trail where created_at < now() - interval ''30 days'' and (trip_check is null or booking_id is null);');
    end if;
  else
    raise notice 'pg_cron is not installed here: gps-tidy-pins is not scheduled';
  end if;
end
$cron$;
