-- GPS P0-2: a driver's position stops being shared when his trip ends, also
-- for the app versions already installed; the road holds only the trip, timed
-- by the server; and nobody but the driver reads a road point whose time the
-- server could not trust.
--
-- Today the phone stops sharing only when the trip is finished from the GPS
-- screen or the bookings list. Finished anywhere else - the hired driver's
-- panel, the day-by-day screen of a multi-day tour, KEKE ending it - the trip's
-- background task keeps running: it keeps writing the driver's position and
-- keeps adding points to the finished trip's road, which that trip's company,
-- the driver's fleet owner and KEKE's admins can read. The road takes the
-- phone's own clock for when a point happened, so a phone whose clock is
-- wrong can put points from after the trip (or from before it) into the
-- trip's road. And the server never removed a position: 30 were stored on
-- 2026-11-04, none of them on a trip, the oldest from 27 September.
--
-- The app update fixes the phone side. This migration makes the server hold
-- the line for the app versions already installed, without ever answering
-- them with an error (an error would make an app's upload queue retry the
-- same points forever, lib/locationTrail.ts):
--
--   1. The phone's clock is checked. Every app version sends its own clock
--      with each position report (updated_at, the moment it sends); the server
--      notes, per driver, how far it is from the server's clock, when it was
--      last found more than 2 minutes off, and since when it has been found
--      right without a break (gps_device_clock - the server's own table, no
--      app can read or write it). Every report counts, also one that is not
--      stored (below). The server also notes when each trip started (its own
--      time of the switch to "in progress", gps_trip_start).
--   2. driver_location_trail: a driver's own point is stored only for his own
--      trip (he is its driver), judged by the phone's time set right by its
--      measured offset:
--        - while the trip is in progress, if taken after the trip started
--          ("trip"); if the phone's clock is off, or the time is still to
--          come, it is kept for the driver only;
--        - for his completed trip, sent late (within 48 hours, a phone that
--          was offline): if taken between the trip's start and its end. It
--          counts ("late") only if the phone's clock was found right without
--          a break from before the trip's last stretch until after it; if the
--          clock was found off at any time since an hour before the trip
--          started, the point is skipped; otherwise (never seen, or not seen
--          right through the end) it is kept for the driver only.
--      created_at is always the server's time of arrival; trip_check says
--      how the point was let in (null: kept for the driver only). Anything
--      else - a finished trip's later points, a cancelled or declined booking,
--      a job not started, a point with no booking, the fleet owner's own phone
--      on his driver's trip - is skipped quietly (the insert "succeeds",
--      nothing is written) and counted in gps_skip_counts, so a rollout can
--      watch what is skipped.
--   3. Who reads the road: the trip's company, the fleet owner (his driver's
--      trip, or a trip he gave out) and KEKE's admins read only the points
--      the server let in as the trip's ("trip" or "late"). Points stored
--      before this migration (none on 2026-11-04) stay the driver's own: the
--      apps could set both their times, so nothing can show they belong to
--      the trip. The driver reads all of his own.
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
--   6. The existing 30-day road clean-up (trail-cleanup) keeps its 30 days -
--      the published privacy policy promises no long-term GPS history - but
--      counts them from when a point reached the server, not from the phone's
--      clock: a phone whose clock is behind can no longer get its fresh points
--      deleted early.
--
-- A convoy's coordinator row is never a trip here (see P0-1): no point is
-- stored for it, it keeps no position alive and no road is read through it.
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
-- can put them back). Trips in progress while this runs count as started now.
-- Nothing is sent to anyone.
--
-- Rollback: supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql

-- 0. what was skipped, by day: for watching a rollout ---------------------------
create table if not exists public.gps_skip_counts (
  day date not null,
  kind text not null,
  driver_id uuid not null,
  n bigint not null default 0,
  -- one row per driver: one phone's skips never wait for another's
  primary key (day, kind, driver_id)
);
alter table public.gps_skip_counts enable row level security;
revoke all on table public.gps_skip_counts from public, anon, authenticated;
grant all on table public.gps_skip_counts to service_role;

create or replace function public.gps_count_skip(p_kind text, p_driver uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.gps_skip_counts as s (day, kind, driver_id, n)
  values ((now() at time zone 'Asia/Tbilisi')::date, p_kind, p_driver, 1)
  on conflict (day, kind, driver_id) do update set n = s.n + 1;
exception when others then
  null;  -- counting must never cost the driver anything
end;
$$;
revoke all on function public.gps_count_skip(text, uuid) from public, anon, authenticated;

-- 1. the phone's clock -------------------------------------------------------------
create table if not exists public.gps_device_clock (
  driver_id uuid primary key references auth.users (id) on delete cascade,
  -- the phone's clock minus the server's, as last measured; kept steady (it
  -- moves only when the difference changes by more than 30 seconds)
  skew interval not null,
  measured_at timestamptz not null,
  -- the last time the phone's clock was found more than 2 minutes off
  off_seen_at timestamptz,
  -- since when every measurement found it right (null while it is off)
  ok_since timestamptz
);
alter table public.gps_device_clock add column if not exists ok_since timestamptz;
alter table public.gps_device_clock enable row level security;
revoke all on table public.gps_device_clock from public, anon, authenticated;
grant all on table public.gps_device_clock to service_role;

create or replace function public.driver_locations_device_clock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_skew interval;
  v_off  boolean;
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
    v_skew := new.updated_at - now();
    v_off := abs(extract(epoch from v_skew)) > 120;
    insert into public.gps_device_clock as c (driver_id, skew, measured_at, off_seen_at, ok_since)
    values (new.driver_id, v_skew, now(),
            case when v_off then now() end,
            case when not v_off then now() end)
    on conflict (driver_id) do update
      set measured_at = excluded.measured_at,
          skew = case when abs(extract(epoch from (excluded.skew - c.skew))) > 30
                      then excluded.skew else c.skew end,
          off_seen_at = coalesce(excluded.off_seen_at, c.off_seen_at),
          -- the start of an unbroken run of right measurements; none while off
          ok_since = case when excluded.ok_since is null then null
                          else coalesce(c.ok_since, excluded.ok_since) end;
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

-- 2. when each trip started: the server's time of the switch to "in progress" --
create table if not exists public.gps_trip_start (
  booking_id uuid primary key references public.bookings (id) on delete cascade,
  started_at timestamptz not null
);
alter table public.gps_trip_start enable row level security;
revoke all on table public.gps_trip_start from public, anon, authenticated;
grant all on table public.gps_trip_start to service_role;

create or replace function public.bookings_gps_trip_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A trip (re)started: its road begins now. Already in progress: unchanged.
  if tg_op = 'INSERT' or old.status is distinct from 'in_progress' then
    begin
      insert into public.gps_trip_start (booking_id, started_at)
      values (new.id, now())
      on conflict (booking_id) do update set started_at = excluded.started_at;
    exception when others then
      null;  -- the bookkeeping must never cost a booking its change
    end;
  end if;
  return null;
end;
$$;
revoke all on function public.bookings_gps_trip_start() from public, anon, authenticated;

drop trigger if exists bookings_gps_trip_start on public.bookings;
create trigger bookings_gps_trip_start
  after insert or update of status on public.bookings
  for each row when (new.status = 'in_progress' and new.is_group_master is not true)
  execute function public.bookings_gps_trip_start();

-- trips already under way when this runs: started now, as far as the road goes
insert into public.gps_trip_start (booking_id, started_at)
select b.id, now() from public.bookings b where b.status = 'in_progress' and b.is_group_master is not true
on conflict (booking_id) do nothing;

-- 3. the road: only points of the driver's running or just-completed trip ------
alter table public.driver_location_trail
  add column if not exists trip_check text;
alter table public.driver_location_trail
  drop constraint if exists driver_location_trail_trip_check_check;
alter table public.driver_location_trail
  add constraint driver_location_trail_trip_check_check check (trip_check in ('trip', 'late'));
create index if not exists driver_location_trail_created_idx on public.driver_location_trail (created_at);

drop function if exists public.gps_trip_accepts_point(uuid, uuid, timestamptz);
drop function if exists public.gps_backfill_trip_check();
-- 'trip', 'late', 'unchecked' (kept for the driver only) or null (skipped).
-- p_at is the phone's time; set right by the phone's measured offset where
-- the server has one.
create or replace function public.gps_road_point_kind(p_driver uuid, p_booking uuid, p_at timestamptz)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
           when b.status = 'in_progress' then
             case
               -- taken before the trip started: not the trip's
               when p_at - coalesce(c.skew, interval '0') < t.start_at - interval '2 minutes' then null
               -- the phone's clock is off now, or the time is still to come: for the driver only
               when c.driver_id is not null and c.ok_since is null then 'unchecked'
               when p_at - coalesce(c.skew, interval '0') > now() + interval '2 minutes' then 'unchecked'
               else 'trip'
             end
           when b.status = 'completed' and b.completed_at is not null
                and now() <= b.completed_at + interval '48 hours' then
             case
               -- a phone the server has never measured: for the driver only
               when c.driver_id is null then
                 case when p_at between t.start_at - interval '2 minutes' and b.completed_at + interval '2 minutes'
                      then 'unchecked' end
               -- off now, or off at any time since an hour before the trip started:
               -- its times cannot be trusted
               when c.ok_since is null or c.off_seen_at >= t.start_at - interval '1 hour' then null
               -- found right without a break from before the trip's last stretch
               -- until after it: its time, set right, decides
               when c.ok_since <= j.judge_from and c.measured_at >= j.judge_from then
                 case when p_at - c.skew between t.start_at - interval '2 minutes' and b.completed_at + interval '1 minute'
                      then 'late' end
               -- right now, but not seen right through the end: for the driver only
               else
                 case when p_at between t.start_at - interval '2 minutes' and b.completed_at + interval '2 minutes'
                      then 'unchecked' end
             end
         end
    from public.bookings b
    left join public.gps_device_clock c on c.driver_id = p_driver
    left join public.gps_trip_start s on s.booking_id = b.id
    -- a trip completed before this migration has no start noted: its last day
    cross join lateral (
      select coalesce(s.started_at,
                      case when b.status = 'in_progress' then now() - interval '31 days'
                           else b.completed_at - interval '24 hours' end) as start_at
    ) t
    -- the trip's last stretch: its last hour, or from 10 minutes after its
    -- start for a shorter one (its last minute, at the least)
    cross join lateral (
      select least(b.completed_at - interval '1 minute',
                   greatest(b.completed_at - interval '1 hour', t.start_at + interval '10 minutes')) as judge_from
    ) j
   where p_driver is not null and p_at is not null
     and b.id = p_booking
     and b.driver_id = p_driver
     and b.is_group_master is not true;
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
  begin
    v_kind := public.gps_road_point_kind(new.driver_id, new.booking_id, new.recorded_at);
  exception when others then
    perform public.gps_count_skip('road_point_error', new.driver_id);
    return null;  -- never an error back to an installed app's upload queue
  end;
  if v_kind is null then
    perform public.gps_count_skip('road_point', new.driver_id);
    return null;  -- skipped, not refused: an installed app must not retry it forever
  end if;
  if v_kind = 'unchecked' then
    perform public.gps_count_skip('road_point_unchecked', new.driver_id);
    new.trip_check := null;  -- kept for the driver; nobody else reads it
  else
    new.trip_check := v_kind;
  end if;
  return new;
end;
$$;
revoke all on function public.driver_location_trail_keep_trip_points() from public, anon, authenticated;

drop trigger if exists driver_location_trail_10_trip_points on public.driver_location_trail;
create trigger driver_location_trail_10_trip_points
  before insert on public.driver_location_trail
  for each row execute function public.driver_location_trail_keep_trip_points();

-- 4. who reads the road ------------------------------------------------------------
-- Answers only about the asker and a stored point: whether he may read it as
-- the trip's company, its fleet owner or an admin. Takes the point itself, so
-- it cannot be asked about made-up times.
drop function if exists public.gps_road_point_visible(text, uuid, timestamptz, text);
create or replace function public.gps_road_point_visible(p_as text, p_point bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from public.driver_location_trail t
         join public.bookings b on b.id = t.booking_id
        where t.id = p_point
          and t.trip_check is not null
          and b.is_group_master is not true
          and case p_as
                when 'company' then b.company_id = auth.uid()
                when 'fleet' then b.host_driver_id = auth.uid()
                                  or exists (select 1 from public.driver_fleet f
                                              where f.host_driver_id = auth.uid()
                                                and f.sub_driver_id = b.driver_id
                                                and f.status = 'accepted')
                when 'admin' then exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
                else false
              end);
$$;
revoke all on function public.gps_road_point_visible(text, bigint) from public, anon, authenticated;
grant execute on function public.gps_road_point_visible(text, bigint) to authenticated, service_role;

drop policy if exists driver_location_trail_company_read on public.driver_location_trail;
create policy driver_location_trail_company_read on public.driver_location_trail
  as permissive for select to authenticated
  using (public.gps_road_point_visible('company', id));

drop policy if exists driver_location_trail_fleet_host_read on public.driver_location_trail;
create policy driver_location_trail_fleet_host_read on public.driver_location_trail
  as permissive for select to authenticated
  using (public.gps_road_point_visible('fleet', id));

drop policy if exists driver_location_trail_admin_read on public.driver_location_trail;
create policy driver_location_trail_admin_read on public.driver_location_trail
  as permissive for select to authenticated
  using (public.gps_road_point_visible('admin', id));

-- 5. the live position: a trip's background report needs a trip ---------------
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
                        and b.is_group_master is not true
                        and (b.driver_id = new.driver_id or b.host_driver_id = new.driver_id)) then
    perform public.gps_count_skip('background_position', new.driver_id);
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

-- 6. positions left over from finished trips, and old ones ---------------------
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
                        and b.is_group_master is not true
                        and (b.driver_id = dl.driver_id or b.host_driver_id = dl.driver_id))
     and (dl.gps_mode = 'background' or dl.updated_at < p_now - interval '15 minutes');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.gps_tidy_pins(timestamptz) from public, anon, authenticated;
grant execute on function public.gps_tidy_pins(timestamptz) to service_role;

-- 7. the schedules ----------------------------------------------------------------
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
