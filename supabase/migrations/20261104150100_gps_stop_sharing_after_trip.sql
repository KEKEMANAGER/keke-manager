-- GPS P0-2: a driver's position stops being shared when his trip ends, also
-- for the app versions already installed.
--
-- Today the phone stops sharing only when the trip is finished from the GPS
-- screen or the bookings list. Finished anywhere else - the hired driver's
-- panel, the day-by-day screen of a multi-day tour, KEKE ending it - the trip's
-- background task keeps running: it keeps writing the driver's position and
-- keeps adding points to the finished trip's road, which that trip's company
-- can read. And the server never removed a position: 30 were stored on
-- 2026-11-04, none of them on a trip, the oldest from 27 September.
--
-- The app update fixes the phone side. This migration makes the server hold
-- the line for the app versions already installed, without ever answering
-- them with an error (an error would make an app's upload queue retry the
-- same points forever, lib/locationTrail.ts):
--
--   1. driver_location_trail: a driver's own point is stored only if it
--      belongs to his trip in progress, or to his completed trip, was recorded
--      no later than two minutes after the trip was completed and arrives
--      within 48 hours of it (a phone that was offline). Anything else - a
--      finished trip's later points, a cancelled or declined booking, a job
--      not started, a point with no booking - is skipped quietly (the insert
--      "succeeds", nothing is written).
--   2. driver_locations: a position the trip's background task sends
--      (gps_mode 'background', freshly stamped) while the driver has no trip
--      in progress is skipped the same way. The open GPS screen
--      ('foreground') is not affected; apps from before 24 October 2026 send
--      no mode and are not affected either (no company sees them: P0-1).
--   3. gps_tidy_pins(), every 5 minutes: removes the position of a driver who
--      has no trip in progress if it came from a trip's background task, or if
--      it is older than 24 hours. A fleet owner still sees his drivers' open
--      GPS screens; nobody sees a position left over from a finished trip.
--
-- Both checks look only at a driver's own rows: anything else is left to the
-- row-level rules, which refuse it as before - so the answer never tells
-- anyone whether some driver is on a trip. None of the new functions can be
-- called by the apps (Supabase lets anon and authenticated execute every new
-- function in public unless told otherwise).
--
-- The first run of gps_tidy_pins() removes the positions left over today
-- (stored positions only, no booking changes). Nothing is sent to anyone.
--
-- Rollback: supabase/rollback/20261104150100_gps_stop_sharing_after_trip_undo.sql

-- 1. the road: only points of a running or just-completed trip ---------------
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
          and (b.driver_id = p_driver or b.host_driver_id = p_driver)
          and (b.status = 'in_progress'
               or (b.status = 'completed'
                   and b.completed_at is not null
                   and p_at <= b.completed_at + interval '2 minutes'
                   and now() <= b.completed_at + interval '48 hours'))
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
begin
  -- Someone else's row: the row-level rules decide (and refuse it), as before.
  if new.driver_id is distinct from auth.uid() then
    return new;
  end if;
  if not public.gps_trip_accepts_point(new.driver_id, new.booking_id, new.recorded_at) then
    return null;  -- skipped, not refused: an installed app must not retry it forever
  end if;
  return new;
end;
$$;
revoke all on function public.driver_location_trail_keep_trip_points() from public, anon, authenticated;

drop trigger if exists driver_location_trail_10_trip_points on public.driver_location_trail;
create trigger driver_location_trail_10_trip_points
  before insert on public.driver_location_trail
  for each row execute function public.driver_location_trail_keep_trip_points();

-- 2. the live position: a trip's background report needs a trip ---------------
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

-- 3. positions left over from finished trips, and old ones ---------------------
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

do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('gps-tidy-pins', '*/5 * * * *', 'select public.gps_tidy_pins();');
  else
    raise notice 'pg_cron is not installed here: gps-tidy-pins is not scheduled';
  end if;
end
$cron$;
