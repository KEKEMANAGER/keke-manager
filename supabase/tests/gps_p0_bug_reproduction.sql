-- GPS P0: the problems the 2026-11-04 audit found, as checks. Each check
-- passes ("ok ... BUG(P0-n): ...") while the problem is there. On production
-- as it is (the snapshot + the migrations production ran) all 15 hold; after
-- 20261104150000 the P0-1 ones fail, after 20261104150100 the P0-2 ones,
-- after 20261104150200 the P0-3 ones - which is what the runner expects.
-- Fake data only (fixtures/gps_p0_seed.sql); everything is rolled back.
begin;
\ir fixtures/gps_p0_seed.sql
select plan(15);

-- P0-1: who reads where a driver is --------------------------------------------
select ok(tests.pins_seen_by(tests.gp('CB')) ~ '(^|,)D1(,|$)',
  'BUG(P0-1): CB, whose trip with D1 was completed yesterday, reads where D1 is now');
select ok(tests.pins_seen_by(tests.gp('CC')) ~ '(^|,)D1(,|$)',
  'BUG(P0-1): CC, whose job with D1 is next week, reads where D1 is now');
select ok(tests.pins_seen_by(tests.gp('CA')) ~ '(^|,)D3(,|$)',
  'BUG(P0-1): CA reads where D3 is through a request D3 never accepted');
select ok(tests.pins_seen_by(tests.gp('CA')) ~ '(^|,)D8(,|$)',
  'BUG(P0-1): CA reads where D8 is after their trip was completed');
-- a road point recorded long after DONE_B was completed (as an installed app could send it)
set local session_replication_role = replica;
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
values (tests.gp('D1'), tests.gp('DONE_B'), now() - interval '5 minutes', 41.72, 44.81);
set local session_replication_role = origin;
select ok(tests.trail_seen_by(tests.gp('CB')) ~ 'DONE_B:3',
  'BUG(P0-1): CB reads a road point D1 recorded a day after their trip was completed');

-- P0-2: sharing that does not stop -------------------------------------------
select ok(tests.app_trail(tests.gp('D1'), tests.gp('DONE_B'), now()) = '1',
  'BUG(P0-2): D1''s app adds a point to yesterday''s finished trip, and it is stored');
select ok(tests.app_trail(tests.gp('D2'), tests.gp('CNL_B'), now()) = '1',
  'BUG(P0-2): a road point for a cancelled booking is stored');
select ok(tests.app_trail(tests.gp('D5'), null, now()) = '1',
  'BUG(P0-2): a road point with no trip at all is stored');
select ok(tests.app_report(tests.gp('D8'), 'background') = '1',
  'BUG(P0-2): D8''s trip task keeps writing his position after the trip was completed');
select tests.gps_server_jobs();
select ok(tests.has_pin(tests.gp('D8')),
  'BUG(P0-2): the server leaves D8''s position from the finished trip in place');
select ok(tests.has_pin(tests.gp('D2')),
  'BUG(P0-2): the server keeps D2''s two-day-old position (no trip) for ever');

-- P0-3: the watch -------------------------------------------------------------
select tests.set_pin(tests.gp('D6'), 'foreground', now() - interval '30 minutes');
select public.watch_trip_gps();
select ok(not exists (select 1 from public.trip_gps_watch where driver_id = tests.gp('D6'))
          and tests.gps_notices('D6') = 0,
  'BUG(P0-3): the watch never looks at D6''s trip (open screen only), quiet for 30 minutes');
select ok(not exists (select 1 from public.trip_gps_watch where driver_id = tests.gp('D7')),
  'BUG(P0-3): the watch never looks at D7''s trip, which has no position at all');
select ok(tests.flap_wakes('D1', 3) > 12,
  'BUG(P0-3): a phone that reports now and then is woken again and again - more than 12 wake-ups in one trip');
select ok(tests.app_report(tests.gp('D1'), 'background', 41.70, 44.80, now() + interval '3 hours') = '1'
          and tests.pin_at(tests.gp('D1')) > now() + interval '2 hours',
  'BUG(P0-3): a phone clock 3 hours ahead makes its position look fresh for 3 hours');

select * from finish();
rollback;
