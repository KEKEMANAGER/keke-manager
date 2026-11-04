-- GPS P0-3: a frozen or missing GPS is noticed on every trip, the driver is
-- told a bounded number of times, and "how old is this position" is the
-- server's clock.
--
-- watch_trip_gps() (cron watch-trip-gps, every 2 minutes) looked only at trips
-- whose driver had a stored position sent by the trip's background task. Two
-- kinds of trip were never checked:
--   * a driver who chose "only while the app is open" (gps_mode 'foreground'):
--     his position freezes the moment he switches to Maps or locks the screen;
--   * a trip with no position at all: GPS never turned on, or turned off.
-- And its limits were per quiet spell: every position that came in started a
-- new spell with fresh counts, so a phone that reported now and then could be
-- woken every 10 minutes and told "GPS stopped" again and again, all day.
--
-- Now, for every trip in progress (the watch notes when it first saw the
-- trip; a position from before that - an open screen earlier in the day -
-- counts as quiet only from that moment, so nobody is told "GPS stopped" the
-- minute a trip starts):
--   * live (a position younger than 10 minutes): nothing; a spell ends;
--   * the background GPS went quiet: a silent wake-up as before (it lets the
--     app report and restart the trip's GPS) - at most 6 per spell and 12 per
--     trip, 10 minutes apart; never to a driver who chose "only while the app
--     is open", whose choice stands;
--   * quiet for 20 minutes - background, open-screen only, or no position at
--     all since the watch first saw the trip - the driver is told, by day
--     (08:00-21:59 Tbilisi), at most 3 times per trip and 2 hours apart;
--   * quiet for more than 12 hours, or still "in progress" more than 12 hours
--     after its last planned day (the booking's start + its days): a trip
--     left open, nobody is told or woken - also on the day this runs.
-- The counts belong to the trip: they reset only when the driver's next trip
-- starts, and the watch row goes when the trip ends. A driver with two trips
-- in progress at once is watched on the newest one, always the same one.
-- None of these functions can be called by the apps.
--
-- Positions: updated_at (and gps_mode_at when a mode is sent) is set by the
-- server when the position arrives, not taken from the phone. A phone whose
-- clock was hours off made a frozen position look fresh (to this watch and to
-- every map) or a live one look hours old. The maps show "live" / "weak
-- signal" / "signal lost" from this time (lib/signalAge.ts).
--
-- watch_trip_gps now takes the moment it judges as an argument, defaulting to
-- now() - the cron's "select public.watch_trip_gps();" calls it unchanged.
-- Nobody is told anything by this migration itself.
--
-- Rollback: supabase/rollback/20261104150200_gps_watch_every_trip_undo.sql

-- the server's clock on every stored position --------------------------------
create or replace function public.driver_locations_server_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.gps_mode_at is not null then
      new.gps_mode_at := now();
    end if;
  elsif new.gps_mode_at is distinct from old.gps_mode_at then
    new.gps_mode_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.driver_locations_server_time() from public, anon, authenticated;

drop trigger if exists driver_locations_20_server_time on public.driver_locations;
create trigger driver_locations_20_server_time
  before insert or update on public.driver_locations
  for each row execute function public.driver_locations_server_time();

-- per-trip counts --------------------------------------------------------------
alter table public.trip_gps_watch
  add column if not exists trip_seen_at timestamptz,
  add column if not exists quiet_kind text,
  add column if not exists trip_silent_total integer not null default 0,
  add column if not exists trip_alert_total integer not null default 0;

-- the watch ----------------------------------------------------------------------
drop function if exists public.watch_trip_gps();
create or replace function public.watch_trip_gps(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r            record;
  w            public.trip_gps_watch%rowtype;
  have_watch   boolean;
  kind         text;
  since        timestamptz;
  tok          text;
  tbilisi_hour int := extract(hour from (p_now at time zone 'Asia/Tbilisi'));
  acted        int := 0;
begin
  for r in
    select distinct on (b.driver_id)
           b.driver_id, b.id as booking_id, dl.updated_at as loc_at, dl.gps_mode,
           public.parse_booking_start_ts(b.date_display)
             + make_interval(days => public.tour_day_count(b.id)) + interval '12 hours' as left_open_after
      from public.bookings b
      left join public.driver_locations dl on dl.driver_id = b.driver_id
     where b.status = 'in_progress'
       and b.driver_id is not null
     -- Two trips in progress at once: the newest, and always the same one.
     order by b.driver_id, b.created_at desc, b.id desc
  loop
    select * into w from public.trip_gps_watch where driver_id = r.driver_id;
    have_watch := found;
    if have_watch and w.booking_id is distinct from r.booking_id then
      -- His next trip: it starts with its own counts.
      delete from public.trip_gps_watch where driver_id = r.driver_id;
      have_watch := false;
    end if;
    if not have_watch then
      -- First sight of this trip: noted, so an older position does not count
      -- against it.
      insert into public.trip_gps_watch (driver_id, booking_id, trip_seen_at)
      values (r.driver_id, r.booking_id, p_now);
      select * into w from public.trip_gps_watch where driver_id = r.driver_id;
    elsif w.trip_seen_at is null then
      -- A row the old watch made: seen from now on.
      update public.trip_gps_watch set trip_seen_at = p_now where driver_id = r.driver_id;
      w.trip_seen_at := p_now;
    end if;

    -- Still "in progress" half a day after its last planned day: a trip left
    -- open, not one under way - nobody is woken or told (also when the watch
    -- sees it for the first time, e.g. the day this runs).
    if r.left_open_after is not null and p_now > r.left_open_after then
      continue;
    end if;

    -- Live: a quiet spell that was going on is over; the trip's totals stay.
    if r.loc_at is not null and r.loc_at > p_now - interval '10 minutes' then
      if w.quiet_since is not null then
        update public.trip_gps_watch
           set quiet_since = null, quiet_kind = null,
               silent_sent_at = null, silent_count = 0, alert_count = 0
         where driver_id = r.driver_id;
      end if;
      continue;
    end if;

    kind := case when r.loc_at is null then 'no_pin'
                 when r.gps_mode = 'foreground' then 'foreground'
                 else 'background' end;
    -- Quiet since his last position, but not before the watch saw the trip;
    -- with no position at all, since it saw the trip.
    since := greatest(coalesce(r.loc_at, w.trip_seen_at), coalesce(w.trip_seen_at, r.loc_at));

    -- A trip quiet for half a day is one left open, not a GPS that just
    -- stopped: nobody is told about that one.
    if since < p_now - interval '12 hours' then
      continue;
    end if;

    if w.quiet_since is distinct from since or w.quiet_kind is distinct from kind then
      update public.trip_gps_watch
         set quiet_since = since, quiet_kind = kind,
             silent_sent_at = null, silent_count = 0, alert_count = 0
       where driver_id = r.driver_id;
      select * into w from public.trip_gps_watch where driver_id = r.driver_id;
    end if;

    tok := public.fetch_user_push_token(r.driver_id);

    -- 1) The trip's background GPS went quiet: wake the app without showing
    --    anything - it reports where it is and restarts the trip's GPS. Every
    --    10 minutes, at most 6 times a spell and 12 times a trip. Never for a
    --    driver who chose to be located only while the app is open.
    if kind = 'background'
       and tok is not null
       and w.silent_count < 6
       and w.trip_silent_total < 12
       and (w.silent_sent_at is null or w.silent_sent_at < p_now - interval '10 minutes') then
      perform public.send_expo_silent_push(
        tok,
        jsonb_build_object('type', 'gps_wake', 'booking_id', r.booking_id::text)
      );
      update public.trip_gps_watch
         set silent_sent_at = p_now, silent_count = silent_count + 1,
             trip_silent_total = trip_silent_total + 1
       where driver_id = r.driver_id;
      acted := acted + 1;
    end if;

    -- 2) Quiet for 20 minutes (or no position for 20 minutes): tell the
    --    driver. By day only, at most 3 times a trip, two hours apart.
    if since < p_now - interval '20 minutes'
       and tbilisi_hour between 8 and 21
       and w.trip_alert_total < 3
       and (w.alert_sent_at is null or w.alert_sent_at < p_now - interval '2 hours') then
      perform public.booking_notify(
        r.driver_id,
        'KEKE · GPS',
        case when kind = 'no_pin'
             then 'GPS ჩართული არ არის. გახსენი KEKE Manager და ჩართე GPS, რომ კომპანიამ რუკაზე დაგინახოს.'
             else 'GPS გაჩერდა. გახსენი KEKE Manager, რომ კომპანიამ რუკაზე დაგინახოს.'
        end,
        'gps_stopped',
        jsonb_build_object('type', 'gps_stopped', 'booking_id', r.booking_id::text, 'reason', kind)
      );
      update public.trip_gps_watch
         set alert_sent_at = p_now, alert_count = alert_count + 1,
             trip_alert_total = trip_alert_total + 1
       where driver_id = r.driver_id;
      acted := acted + 1;
    end if;
  end loop;

  -- Trips that ended take their watch with them.
  delete from public.trip_gps_watch g
   where not exists (select 1 from public.bookings b
                      where b.id = g.booking_id
                        and b.driver_id = g.driver_id
                        and b.status = 'in_progress');

  return acted;
end;
$$;
revoke all on function public.watch_trip_gps(timestamptz) from public, anon, authenticated;
grant execute on function public.watch_trip_gps(timestamptz) to service_role;
