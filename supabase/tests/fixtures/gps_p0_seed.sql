-- Fake accounts, bookings and positions for the GPS P0 tests. No real data:
-- invented names, made-up coordinates around Tbilisi, phone tokens
-- "ExponentPushToken[gps-<name>]"; net.http_post is the shim's recorder, so
-- nothing leaves the machine. Included by the test files; runs as the
-- database owner inside the test's transaction, which is rolled back.
-- Ids are tests.gp('<name>').
--
-- Accounts: companies CA CB CC, admins ADM ADM2, drivers D1..D9, fleet owner
-- H with his drivers S and S2.
-- Bookings:
--   LIVE_A   CA's trip in progress, driver D1
--   DONE_B   CB's trip with D1, completed yesterday
--   FUT_C    CC's job for next week, accepted by D1
--   CNL_B    CB's booking with D2, cancelled
--   OFF_A    CA's request to D3, pending
--   REJ_C    CC's booking with D4, declined
--   LIVE_B6  CB's trip in progress, driver D6 (located only while his app is open)
--   LIVE_C7  CC's trip in progress, driver D7 (no position at all)
--   FLT_A    CA's trip in progress, given by fleet owner H to his driver S
--   DONE_A8  CA's trip with D8, completed 30 minutes ago (his app kept sending)
--   DONE_S2  CA's trip given by H to S2, completed 10 minutes ago (an app from
--            before 24 October: it sends no mode and kept sending)
--   TOUR_9   CB's three-day tour with D9, in progress since the day before
--            yesterday; day 1 closed
-- Positions (driver_locations): D1 S (background, live), D2 (open screen, two
-- days old), D3 D5 H (open screen, live), D4 (background, two days old),
-- D6 (open screen, live), D8 (background, live - left over from DONE_A8),
-- S2 (no mode, live - after DONE_S2), D9 (background, live, on the tour).
-- Road points carry the time they reached the server (created_at) a minute
-- after they were recorded, and (where the server checks them) count as
-- received during their trips.

create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local session authorization authenticator';
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.act_as_owner() returns void
language plpgsql as $$
begin
  execute 'reset session authorization';
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function tests.gp(p_name text) returns uuid
language sql immutable as $$
  select md5('keke-gps-p0-test:' || p_name)::uuid
$$;

create or replace function tests.gtok(p_name text) returns text
language sql immutable as $$
  select 'ExponentPushToken[gps-' || p_name || ']'
$$;

create table if not exists tests.gnames (id uuid primary key, name text not null);
grant select on tests.gnames to public;

create or replace function tests.gname(p_id uuid) returns text
language sql stable as $$
  select coalesce((select name from tests.gnames where id = p_id), '?')
$$;

-- The drivers whose position this person can read, by name ("D1,S").
create or replace function tests.pins_seen_by(p_viewer uuid) returns text
language plpgsql as $$
declare r text;
begin
  perform tests.act_as(p_viewer);
  select string_agg(tests.gname(driver_id), ',' order by tests.gname(driver_id)) into r
    from public.driver_locations;
  perform tests.act_as_owner();
  return coalesce(r, '');
end;
$$;

-- The road points this person can read: "<booking>:<count>" per booking.
create or replace function tests.trail_seen_by(p_viewer uuid) returns text
language plpgsql as $$
declare r text;
begin
  perform tests.act_as(p_viewer);
  select string_agg(x.b || ':' || x.n, ',' order by x.b) into r
    from (select tests.gname(booking_id) b, count(*) n
            from public.driver_location_trail group by booking_id) x;
  perform tests.act_as_owner();
  return coalesce(r, '');
end;
$$;

-- The legacy locations rows this person can read.
create or replace function tests.legacy_seen_by(p_viewer uuid) returns int
language plpgsql as $$
declare n int;
begin
  perform tests.act_as(p_viewer);
  select count(*) into n from public.locations;
  perform tests.act_as_owner();
  return n;
end;
$$;

-- The passenger marks this person can read.
create or replace function tests.events_seen_by(p_viewer uuid) returns int
language plpgsql as $$
declare n int;
begin
  perform tests.act_as(p_viewer);
  select count(*) into n from public.trip_events;
  perform tests.act_as_owner();
  return n;
end;
$$;

-- What the driver's app does: upsert its position the way supabase-js does
-- (insert ... on conflict (driver_id) do update), as the driver. Returns the
-- rows written (0 = skipped quietly) or the SQLSTATE of an error.
create or replace function tests.app_report(p_driver uuid, p_mode text, p_lat double precision default 41.70,
                                           p_lng double precision default 44.80,
                                           p_phone_time timestamptz default now() - interval '0.4 seconds')
returns text
language plpgsql as $$
declare n int; st text;
begin
  perform tests.act_as(p_driver);
  begin
    if p_mode is null then
      insert into public.driver_locations as dl (driver_id, latitude, longitude, updated_at)
      values (p_driver, p_lat, p_lng, p_phone_time)
      on conflict (driver_id) do update
        set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at;
    else
      insert into public.driver_locations as dl (driver_id, latitude, longitude, updated_at, gps_mode, gps_mode_at)
      values (p_driver, p_lat, p_lng, p_phone_time, p_mode, p_phone_time)
      on conflict (driver_id) do update
        set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = excluded.updated_at,
            gps_mode = excluded.gps_mode, gps_mode_at = excluded.gps_mode_at;
    end if;
    get diagnostics n = row_count;
    st := n::text;
  exception when others then
    st := sqlstate;
  end;
  perform tests.act_as_owner();
  return st;
end;
$$;

-- The app's road upload: upsert ... on conflict do nothing, as the driver.
create or replace function tests.app_trail(p_driver uuid, p_booking uuid, p_at timestamptz,
                                          p_created timestamptz default null) returns text
language plpgsql as $$
declare n int; st text;
begin
  perform tests.act_as(p_driver);
  begin
    if p_created is null then
      insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
      values (p_driver, p_booking, p_at, 41.71, 44.79)
      on conflict (driver_id, recorded_at) do nothing;
    else
      insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude, created_at)
      values (p_driver, p_booking, p_at, 41.71, 44.79, p_created)
      on conflict (driver_id, recorded_at) do nothing;
    end if;
    get diagnostics n = row_count;
    st := n::text;
  exception when others then
    st := sqlstate;
  end;
  perform tests.act_as_owner();
  return st;
end;
$$;

-- A position as old as the test says, written past the triggers (the owner
-- setting up a scene, not an app).
create or replace function tests.set_pin(p_driver uuid, p_mode text, p_at timestamptz) returns void
language plpgsql as $$
begin
  set local session_replication_role = replica;
  insert into public.driver_locations (driver_id, latitude, longitude, updated_at, gps_mode, gps_mode_at)
  values (p_driver, 41.70, 44.80, p_at, p_mode, case when p_mode is null then null else p_at end)
  on conflict (driver_id) do update
    set updated_at = excluded.updated_at, gps_mode = excluded.gps_mode, gps_mode_at = excluded.gps_mode_at;
  set local session_replication_role = origin;
end;
$$;

-- Any statement as this person: rows it touched, or the SQLSTATE it failed with.
create or replace function tests.try_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare n int; st text;
begin
  perform tests.act_as(p_user);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    st := n::text;
  exception when others then
    st := sqlstate;
  end;
  perform tests.act_as_owner();
  return st;
end;
$$;

create or replace function tests.pin_lat(p_driver uuid) returns double precision
language sql security definer set search_path = public as $$
  select latitude from public.driver_locations where driver_id = p_driver
$$;

create or replace function tests.pin_mode(p_driver uuid) returns text
language sql security definer set search_path = public as $$
  select gps_mode from public.driver_locations where driver_id = p_driver
$$;

create or replace function tests.pins() returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(tests.gname(driver_id), ',' order by tests.gname(driver_id)), '') from public.driver_locations
$$;

create or replace function tests.pin_at(p_driver uuid) returns timestamptz
language sql security definer set search_path = public as $$
  select updated_at from public.driver_locations where driver_id = p_driver
$$;

create or replace function tests.has_pin(p_driver uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.driver_locations where driver_id = p_driver)
$$;

create or replace function tests.trail_points(p_booking uuid) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.driver_location_trail where booking_id = p_booking
$$;

-- What reached the phones and the bell.
create or replace function tests.wakes_to(p_name text) returns int
language sql security definer set search_path = public, net as $$
  select count(*)::int from net.http_calls c
   where c.url like 'https://exp.host/%' and c.body ->> 'to' = tests.gtok(p_name)
     and c.body -> 'data' ->> 'type' = 'gps_wake' and c.body ? '_contentAvailable'
$$;

create or replace function tests.gps_notices(p_name text) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.notifications n
   where n.user_id = tests.gp(p_name) and n.type = 'gps_stopped'
$$;

create or replace function tests.gps_notice_bodies(p_name text) returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(n.body, ' || ' order by n.created_at, n.id), '')
    from public.notifications n where n.user_id = tests.gp(p_name) and n.type = 'gps_stopped'
$$;

-- A clock for the watch: noon in Tbilisi today (it tells drivers by day only).
create or replace function tests.noon() returns timestamptz
language sql stable as $$
  select (date_trunc('day', now() at time zone 'Asia/Tbilisi') + interval '12 hours') at time zone 'Asia/Tbilisi'
$$;

-- n minutes go by: every stored position and every time the watch noted moves
-- n minutes into the past (now() does not move inside the test transaction).
create or replace function tests.gps_advance(p_minutes int) returns void
language plpgsql as $$
begin
  set local session_replication_role = replica;
  update public.driver_locations
     set updated_at = updated_at - make_interval(mins => p_minutes),
         gps_mode_at = gps_mode_at - make_interval(mins => p_minutes);
  update public.trip_gps_watch
     set quiet_since = quiet_since - make_interval(mins => p_minutes),
         silent_sent_at = silent_sent_at - make_interval(mins => p_minutes),
         alert_sent_at = alert_sent_at - make_interval(mins => p_minutes);
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'trip_gps_watch' and column_name = 'trip_seen_at') then
    execute format('update public.trip_gps_watch set trip_seen_at = trip_seen_at - make_interval(mins => %s)', p_minutes);
  end if;
  set local session_replication_role = origin;
end;
$$;

-- What the server runs on its own schedule besides the watch (none before
-- GPS P0-2).
create or replace function tests.gps_server_jobs() returns void
language plpgsql as $$
begin
  if to_regprocedure('public.gps_tidy_pins(timestamptz)') is not null then
    execute 'select public.gps_tidy_pins()';
  end if;
end;
$$;

-- A phone that reports now and then: p_spells times its last position is 15
-- minutes old, and the watch runs six times, ten minutes apart. Returns the
-- silent wake-ups that reached it in all.
create or replace function tests.flap_wakes(p_name text, p_spells int) returns int
language plpgsql as $$
begin
  for s in 1 .. p_spells loop
    perform tests.set_pin(tests.gp(p_name), 'background', now() - interval '15 minutes');
    for i in 1 .. 6 loop
      perform public.watch_trip_gps();
      perform tests.gps_advance(11);
    end loop;
  end loop;
  return tests.wakes_to(p_name);
end;
$$;

-- The watch has known this driver's trip in progress since p_at (as if it had
-- run then): what an older position is measured against.
create or replace function tests.watch_seen(p_name text, p_at timestamptz) returns void
language plpgsql as $$
begin
  delete from public.trip_gps_watch where driver_id = tests.gp(p_name);
  execute 'insert into public.trip_gps_watch (driver_id, booking_id, trip_seen_at)
           select b.driver_id, b.id, $2 from public.bookings b
            where b.driver_id = $1 and b.status = ''in_progress''
            order by b.created_at desc, b.id desc limit 1'
    using tests.gp(p_name), p_at;
end;
$$;

create or replace function tests.pins_seen_by_anon() returns int
language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local session authorization authenticator';
  execute 'set local role anon';
  select count(*) into n from public.driver_locations;
  perform tests.act_as_owner();
  return n;
end;
$$;

-- The phone clock the server measured for a driver: seconds it is off (null:
-- never measured, or no such bookkeeping on this database).
create or replace function tests.clock_skew(p_driver uuid) returns double precision
language plpgsql security definer set search_path = public as $$
declare v double precision;
begin
  if to_regclass('public.gps_device_clock') is null then return null; end if;
  execute 'select extract(epoch from skew)::double precision from public.gps_device_clock where driver_id = $1'
    into v using p_driver;
  return v;
end;
$$;

create or replace function tests.clock_was_off(p_driver uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v boolean;
begin
  if to_regclass('public.gps_device_clock') is null then return null; end if;
  execute 'select off_seen_at is not null from public.gps_device_clock where driver_id = $1' into v using p_driver;
  return v;
end;
$$;

-- A booking's road as minutes from now, oldest first ("-50,-40,-30").
create or replace function tests.trail_times(p_booking uuid) returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(round(extract(epoch from (recorded_at - now())) / 60)::text, ',' order by recorded_at), '')
    from public.driver_location_trail where booking_id = p_booking
$$;

-- When a stored point reached the server, as the database has it.
create or replace function tests.trail_created(p_driver uuid, p_recorded timestamptz) returns timestamptz
language sql security definer set search_path = public as $$
  select created_at from public.driver_location_trail where driver_id = p_driver and recorded_at = p_recorded
$$;

-- Rows in the GPS tables that hold history (not the live positions).
create or replace function tests.history_rows() returns text
language sql security definer set search_path = public as $$
  select (select count(*) from public.driver_location_trail) || '/' || (select count(*) from public.trip_events)
         || '/' || (select count(*) from public.booking_day_logs) || '/' || (select count(*) from public.locations)
$$;

-- production's 30-day road clean-up, exactly as its schedule holds it; rows deleted
create or replace function tests.run_trail_cleanup() returns int
language plpgsql as $$
declare n int;
begin
  execute (select command from cron.job where jobname = 'trail-cleanup');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- An admin's exception: opens a driver's position (rows, or the SQLSTATE).
create or replace function tests.admin_open(p_admin uuid, p_driver uuid, p_reason text, p_minutes int) returns text
language plpgsql as $$
begin
  return tests.try_as(p_admin, format('select public.gps_admin_open_access(%L::uuid, %L, %s)',
                                      p_driver, p_reason, coalesce(p_minutes::text, 'null')));
end;
$$;

grant execute on all functions in schema tests to public;

-- people ---------------------------------------------------------------------
insert into tests.gnames (id, name)
select tests.gp(x), x
  from unnest(array['CA','CB','CC','ADM','ADM2','D1','D2','D3','D4','D5','D6','D7','D8','D9','H','S','S2',
                    'LIVE_A','DONE_B','FUT_C','CNL_B','OFF_A','REJ_C','LIVE_B6','LIVE_C7','FLT_A','DONE_A8',
                    'DONE_S2','TOUR_9']) x
on conflict (id) do nothing;

insert into auth.users (id, email)
select tests.gp(x), 'gps-' || lower(x) || '@test.invalid'
  from unnest(array['CA','CB','CC','ADM','ADM2','D1','D2','D3','D4','D5','D6','D7','D8','D9','H','S','S2']) x;

insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_available)
select tests.gp(x),
       case when x in ('CA', 'CB', 'CC') then 'company' when x in ('ADM', 'ADM2') then 'admin' else 'driver' end,
       'Test ' || x,
       case when x in ('CA', 'CB', 'CC') then 'Test Tours ' || x end,
       'gps-' || lower(x) || '@test.invalid',
       true, 'approved', true
  from unnest(array['CA','CB','CC','ADM','ADM2','D1','D2','D3','D4','D5','D6','D7','D8','D9','H','S','S2']) x;

insert into public.profiles (id, full_name, is_verified, push_token)
select tests.gp(x), 'Test ' || x, true, tests.gtok(x)
  from unnest(array['CA','CB','CC','ADM','ADM2','D1','D2','D3','D4','D5','D6','D7','D8','D9','H','S','S2']) x;

insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
values (tests.gp('vH'), tests.gp('H'), 'minivan', 'comfort', 'Test model', 'TEST-GPS-vH', 'approved', true, true),
       (tests.gp('vH2'), tests.gp('H'), 'sedan', 'comfort', 'Test model', 'TEST-GPS-vH2', 'approved', true, true);
insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
values (tests.gp('H'), tests.gp('S'), tests.gp('vH'), 'accepted'),
       (tests.gp('H'), tests.gp('S2'), tests.gp('vH2'), 'accepted');

-- bookings -------------------------------------------------------------------
insert into public.bookings (id, company_id, driver_id, host_driver_id, kind, status, date_display, from_location,
                             to_location, price_gel, vehicle_type, vehicle_class, passengers, voucher_code, completed_at)
select tests.gp(b), tests.gp(co), tests.gp(d), case when h is null then null else tests.gp(h) end, 'transfer', st,
       (now() + make_interval(mins => m))::text, 'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2,
       'GPS-' || b, case when st = 'completed' then now() + make_interval(mins => m + 120) end
  from (values
    ('LIVE_A',  'CA', 'D1', null, 'in_progress',   -60),
    ('DONE_B',  'CB', 'D1', null, 'completed',   -1560),
    ('FUT_C',   'CC', 'D1', null, 'accepted',    10080),
    ('CNL_B',   'CB', 'D2', null, 'cancelled',    2880),
    ('OFF_A',   'CA', 'D3', null, 'pending',      4320),
    ('REJ_C',   'CC', 'D4', null, 'rejected',     5760),
    ('LIVE_B6', 'CB', 'D6', null, 'in_progress',   -45),
    ('LIVE_C7', 'CC', 'D7', null, 'in_progress',   -40),
    ('FLT_A',   'CA', 'S',  'H',  'in_progress',   -30),
    ('DONE_A8', 'CA', 'D8', null, 'completed',    -150),
    ('DONE_S2', 'CA', 'S2', 'H',  'completed',    -130)
  ) as x(b, co, d, h, st, m);

-- the three-day tour: started the day before yesterday (Tbilisi), day 1 closed
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code, tour_days)
select tests.gp('TOUR_9'), tests.gp('CB'), tests.gp('D9'), 'tour', 'in_progress', (d - 2)::text,
       'Test hotel', 'Test mountains', 900, 'minivan', 'comfort', 6, 'GPS-TOUR_9',
       jsonb_build_array(jsonb_build_object('date', (d - 2)::text), jsonb_build_object('date', (d - 1)::text),
                         jsonb_build_object('date', d::text))
  from (select (now() at time zone 'Asia/Tbilisi')::date d) t;
insert into public.booking_day_logs (booking_id, day_index, day_date, driver_id, closed_at, odometer_value)
select tests.gp('TOUR_9'), 1, (now() at time zone 'Asia/Tbilisi')::date - 2, tests.gp('D9'), now() - interval '30 hours', 10500;

-- positions (written past the triggers: the scene, not an app) --------------
select tests.set_pin(tests.gp(x), mode, now() - make_interval(mins => age))
  from (values ('D1', 'background', 0), ('S', 'background', 0), ('D2', 'foreground', 2880),
               ('D3', 'foreground', 1), ('D5', 'foreground', 1), ('H', 'foreground', 1),
               ('D4', 'background', 2880), ('D6', 'foreground', 1), ('D8', 'background', 0),
               ('S2', null, 0), ('D9', 'background', 0)) as p(x, mode, age);

-- the road and the passenger marks of the trips so far ----------------------
set local session_replication_role = replica;
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude, created_at)
select tests.gp(d), tests.gp(b), now() - make_interval(mins => m), 41.70, 44.80, now() - make_interval(mins => m - 1)
  from (values ('D1', 'LIVE_A', 50), ('D1', 'LIVE_A', 40), ('D1', 'LIVE_A', 30),
               ('D1', 'DONE_B', 1500), ('D1', 'DONE_B', 1490),
               ('S', 'FLT_A', 20), ('D8', 'DONE_A8', 60),
               ('S2', 'DONE_S2', 40), ('S2', 'DONE_S2', 20),
               ('D9', 'TOUR_9', 2700), ('D9', 'TOUR_9', 1300)) as t(d, b, m);
-- where the server checks road points (P0-2), these all came in during their trips
do $tc$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'driver_location_trail' and column_name = 'trip_check') then
    execute 'update public.driver_location_trail set trip_check = ''trip''';
  end if;
end $tc$;
insert into public.trip_events (booking_id, driver_id, kind, happened_at, latitude, longitude, client_event_id)
values (tests.gp('LIVE_A'), tests.gp('D1'), 'pickup', now() - interval '50 minutes', 41.70, 44.80, 'gps-ev-1'),
       (tests.gp('DONE_B'), tests.gp('D1'), 'pickup', now() - interval '25 hours', 41.70, 44.80, 'gps-ev-2'),
       (tests.gp('DONE_B'), tests.gp('D1'), 'dropoff', now() - interval '24 hours', 41.70, 44.80, 'gps-ev-3');
insert into public.locations (driver_id, booking_id, latitude, longitude)
values (tests.gp('D1'), tests.gp('DONE_B'), 41.7, 44.8);
set local session_replication_role = origin;

-- nothing recorded so far counts
delete from public.notifications;
delete from net.http_calls;
