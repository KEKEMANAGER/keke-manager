-- GPS P0-1, P0-2, P0-3 on a database with all three migrations
-- (20261104150000, 20261104150100, 20261104150200). Three companies, an admin,
-- a fleet owner and nine drivers, every booking state; fake data only
-- (fixtures/gps_p0_seed.sql). Nothing is sent anywhere: wake-ups and
-- notifications land in the shim's net.http_calls and in notifications.
-- Everything is rolled back.
begin;
\ir fixtures/gps_p0_seed.sql
select plan(100);

-- ============================================================ P0-1: who reads where a driver is
select is(tests.pins_seen_by(tests.gp('CA')), 'D1,S',
  'P0-1: CA sees exactly the drivers of its two trips in progress (D1; S, given by fleet owner H)');
select is(tests.pins_seen_by(tests.gp('CB')), 'D6',
  'P0-1: CB sees D6 (its trip in progress) - not D1 (finished yesterday), not D2 (cancelled)');
select is(tests.pins_seen_by(tests.gp('CC')), '',
  'P0-1: CC sees nobody - D1''s job is next week, D4 declined, D7 (in progress) sends no position');
select is(tests.pins_seen_by(tests.gp('ADM')), 'D1,D2,D3,D4,D5,D6,D8,H,S', 'P0-1: KEKE''s admin sees every position');
select is(tests.pins_seen_by(tests.gp('H')), 'H,S', 'P0-1: the fleet owner sees himself and his driver S (unchanged)');
select is(tests.pins_seen_by(tests.gp('D1')), 'D1', 'P0-1: a driver sees only himself');
select is(tests.pins_seen_by(tests.gp('D7')), '', 'P0-1: a driver with no position sees nothing');
select is(tests.pins_seen_by_anon(), 0, 'P0-1: someone not signed in sees nothing');
select is(tests.try_as(tests.gp('CA'), $$update public.driver_locations set latitude = 0 where driver_id = tests.gp('D1')$$), '0',
  'P0-1: a company cannot move its driver''s position');
select is(tests.try_as(tests.gp('CA'), $$delete from public.driver_locations where driver_id = tests.gp('D1')$$), '0',
  'P0-1: a company cannot delete its driver''s position');
select is(tests.try_as(tests.gp('CB'), $$insert into public.driver_locations (driver_id, latitude, longitude) values (tests.gp('D5'), 1, 1)$$), '42501',
  'P0-1: a company cannot write anyone''s position');
select is(tests.try_as(tests.gp('CC'), $$insert into public.driver_locations (driver_id, latitude, longitude, gps_mode, gps_mode_at) values (tests.gp('D1'), 1, 1, 'background', now())$$)
          || ' ' ||
          tests.try_as(tests.gp('CC'), $$insert into public.driver_locations (driver_id, latitude, longitude, gps_mode, gps_mode_at) values (tests.gp('D2'), 1, 1, 'background', now())$$),
  '42501 42501', 'P0-2: writing a trip report for someone else is refused the same way whether he is on a trip or not (no hint either way)');
select is(tests.try_as(tests.gp('CC'), $$insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude) values (tests.gp('D1'), tests.gp('LIVE_A'), now(), 1, 1)$$)
          || ' ' ||
          tests.try_as(tests.gp('CC'), $$insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude) values (tests.gp('D2'), tests.gp('CNL_B'), now(), 1, 1)$$),
  '42501 42501', 'P0-2: ... the same for road points');

-- the job for next week starts: then, and only then, CC sees D1
update public.bookings set status = 'in_progress' where id = tests.gp('FUT_C');
select is(tests.pins_seen_by(tests.gp('CC')), 'D1', 'P0-1: once CC''s trip with D1 is under way, CC sees D1');
update public.bookings set status = 'accepted' where id = tests.gp('FUT_C');
select is(tests.pins_seen_by(tests.gp('CC')), '', 'P0-1: ... and not while it is only accepted');

-- the road
select is(tests.trail_seen_by(tests.gp('CA')), 'DONE_A8:1,FLT_A:1,LIVE_A:3',
  'P0-1: CA reads the road of its own trips (running, and the finished one up to its end)');
select is(tests.trail_seen_by(tests.gp('CB')), 'DONE_B:2', 'P0-1: CB reads only the road of its own finished trip');
select is(tests.trail_seen_by(tests.gp('CC')), '', 'P0-1: CC reads no road');
set local session_replication_role = replica;  -- points an installed app might have sent before P0-2
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
select tests.gp('D1'), tests.gp('DONE_B'), b.completed_at + x, 41.72, 44.81
  from public.bookings b, unnest(array[interval '1 minute', interval '3 minutes', interval '20 hours']) x
 where b.id = tests.gp('DONE_B');
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
values (tests.gp('D2'), tests.gp('CNL_B'), now() - interval '7 minutes', 41.72, 44.81);
set local session_replication_role = origin;
select is(tests.trail_seen_by(tests.gp('CB')), 'DONE_B:3',
  'P0-1: of the points after its trip was completed, CB reads only the one within two minutes - not later ones, not a cancelled booking''s');
select is(tests.trail_seen_by(tests.gp('D1')), 'DONE_B:5,LIVE_A:3', 'P0-1: the driver still reads all of his own road');
select is(tests.trail_seen_by(tests.gp('ADM')) ~ 'DONE_B:5', true, 'P0-1: KEKE''s admin reads every point');

-- passenger marks and the old table: as before
select is(tests.events_seen_by(tests.gp('CA')), 1, 'P0-1: CA reads the passenger marks of its trips (1)');
select is(tests.events_seen_by(tests.gp('CB')), 2, 'P0-1: CB reads the marks of its finished trip (2)');
select is(tests.events_seen_by(tests.gp('CC')), 0, 'P0-1: CC reads no marks');
select is(tests.legacy_seen_by(tests.gp('CB')), 0, 'P0-1: the unused locations table: CB reads nothing');
select is(tests.legacy_seen_by(tests.gp('D1')), 1, 'P0-1: ... its driver his own row');

-- ============================================================ P0-2: the server stores only trip data
select is(tests.app_report(tests.gp('D1'), 'background', 41.75, 44.85), '1',
  'P0-2: D1''s trip task during his trip: stored');
select is(tests.app_report(tests.gp('D8'), 'background', 42.50, 44.00), '0',
  'P0-2: D8''s trip task after his trip was completed: skipped, not refused (no error for the installed app)');
select is(tests.pin_lat(tests.gp('D8')), 41.70::double precision, 'P0-2: ... and his stored position did not move');
select is(tests.app_report(tests.gp('D3'), 'background', 42.50, 44.00), '0',
  'P0-2: a trip task''s report from D3, who has no trip: skipped');
select is(tests.pin_mode(tests.gp('D3')) || ' ' || tests.pin_lat(tests.gp('D3')), 'foreground 41.7',
  'P0-2: ... D3''s open-screen position stays as it was');
select is(tests.app_report(tests.gp('D5'), 'foreground', 41.76, 44.86), '1',
  'P0-2: the open GPS screen without a trip still works (the driver''s own map; his fleet owner)');
select is(tests.app_report(tests.gp('D5'), null, 41.77, 44.87), '1', 'P0-2: an older app that sends no mode still works');
select is(tests.app_report(tests.gp('S'), 'background'), '1', 'P0-2: the fleet driver S on CA''s trip: stored');
select is(tests.app_report(tests.gp('H'), 'background'), '1', 'P0-2: the fleet owner H, host of a trip in progress: stored');
delete from public.driver_locations where driver_id = tests.gp('D5');
select is(tests.app_report(tests.gp('D5'), 'background'), '0', 'P0-2: a trip task''s first report with no trip: nothing written');
select ok(not tests.has_pin(tests.gp('D5')), 'P0-2: ... no position created');
select is(tests.app_report(tests.gp('D5'), 'foreground', 41.76, 44.86), '1', 'P0-2: ... his open screen creates it');

select is(tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), now() - interval '1 minute'), '1', 'P0-2: a road point of the trip in progress: stored');
select is(tests.app_trail(tests.gp('D1'), tests.gp('DONE_B'), now()), '0', 'P0-2: a point for yesterday''s finished trip: skipped');
select is(tests.app_trail(tests.gp('D1'), tests.gp('DONE_B'),
            (select completed_at + interval '90 seconds' from public.bookings where id = tests.gp('DONE_B'))), '1',
  'P0-2: a point recorded within two minutes of the trip''s end and uploaded later: stored');
select is(tests.app_trail(tests.gp('D1'), tests.gp('DONE_B'),
            (select completed_at + interval '5 minutes' from public.bookings where id = tests.gp('DONE_B'))), '0',
  'P0-2: a point recorded five minutes after the end: skipped');
select is(tests.app_trail(tests.gp('D2'), tests.gp('CNL_B'), now() - interval '1 minute'), '0', 'P0-2: a cancelled booking: skipped');
select is(tests.app_trail(tests.gp('D1'), tests.gp('FUT_C'), now() - interval '1 minute'), '0', 'P0-2: an accepted job not yet started: skipped');
select is(tests.app_trail(tests.gp('D5'), null, now() - interval '1 minute'), '0', 'P0-2: a point with no trip: skipped');
select is(tests.app_trail(tests.gp('D2'), tests.gp('LIVE_A'), now() - interval '1 minute'), '0', 'P0-2: someone else''s trip: nothing stored');
select is(tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), now() + interval '5 minutes'), '1',
  'P0-2: a phone whose clock is 5 minutes ahead: its road is still stored');
select is(tests.try_as(tests.gp('D1'), $$insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
            values (tests.gp('D1'), tests.gp('LIVE_A'), now() - interval '2 minutes', 41.7, 44.8),
                   (tests.gp('D1'), tests.gp('DONE_B'), now() - interval '3 minutes', 41.7, 44.8),
                   (tests.gp('D1'), tests.gp('LIVE_A'), now() - interval '4 minutes', 41.7, 44.8)
            on conflict (driver_id, recorded_at) do nothing$$), '2',
  'P0-2: an installed app''s upload of three points, one from a finished trip: the two good ones stored, no error - its queue does not jam');
select is(tests.trail_points(tests.gp('LIVE_A')), 7, 'P0-2: LIVE_A''s road: 3 + 1 + 1 + 2 points');
update public.bookings set completed_at = now() - interval '3 days' where id = tests.gp('DONE_A8');
select is(tests.app_trail(tests.gp('D8'), tests.gp('DONE_A8'), now() - interval '3 days' + interval '1 minute'), '0',
  'P0-2: a point of a trip completed three days ago, uploaded only now: skipped (late uploads are taken for 48 hours)');

select is(tests.pins(), 'D1,D2,D3,D4,D5,D6,D8,H,S', 'P0-2: before the tidy job: nine positions');
select is(public.gps_tidy_pins(), 3, 'P0-2: the tidy job removes three');
select is(tests.pins(), 'D1,D3,D5,D6,H,S',
  'P0-2: gone: D8 (left over from a finished trip), D4 (a trip task''s, two days old), D2 (two days old); kept: trips in progress and live open screens');
select tests.set_pin(tests.gp('D3'), 'foreground', now() - interval '23 hours');
select tests.set_pin(tests.gp('D5'), 'foreground', now() - interval '25 hours');
select is(public.gps_tidy_pins(), 1, 'P0-2: an open-screen position without a trip goes after 24 hours ...');
select is(tests.pins(), 'D1,D3,D6,H,S', 'P0-2: ... (D5, 25 hours) and not before (D3, 23 hours)');
select tests.set_pin(tests.gp('D5'), 'foreground', now());

-- ============================================================ P0-3: the server's clock
select is(tests.app_report(tests.gp('D1'), 'background', 41.70, 44.80, now() + interval '3 hours'), '1', 'P0-3: a phone whose clock is 3 hours ahead reports');
select is(tests.pin_at(tests.gp('D1')), now(), 'P0-3: ... its position carries the server''s time, not the phone''s');
select is(tests.app_report(tests.gp('D1'), 'background', 41.70, 44.80, now() - interval '3 hours'), '1', 'P0-3: a phone 3 hours behind reports');
select is(tests.pin_at(tests.gp('D1')), now(), 'P0-3: ... the server''s time again');
select is((select gps_mode_at from public.driver_locations where driver_id = tests.gp('D1')), now(),
  'P0-3: the moment its mode was reported is the server''s too');

-- ============================================================ P0-3: the watch, at noon in Tbilisi
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
select tests.set_pin(tests.gp('D1'), 'background', tests.noon() - interval '15 minutes');
select tests.set_pin(tests.gp('S'), 'background', tests.noon());
select tests.set_pin(tests.gp('D6'), 'foreground', tests.noon() - interval '30 minutes');
select tests.watch_seen(x, tests.noon() - interval '1 hour') from unnest(array['D1', 'D6', 'S']) x;  -- trips under way for an hour; D7''s not seen yet
select is(public.watch_trip_gps(tests.noon()), 2, 'P0-3: noon: two actions');
select is(tests.wakes_to('D1') || '/' || tests.gps_notices('D1'), '1/0',
  'P0-3: D1 (trip GPS quiet 15 minutes): one silent wake-up, no notice yet');
select is(tests.wakes_to('D6') || '/' || tests.gps_notices('D6'), '0/1',
  'P0-3: D6 (open screen only, quiet 30 minutes): never woken silently - his choice stands - and told once');
select ok(tests.gps_notice_bodies('D6') like 'GPS გაჩერდა.%', 'P0-3: ... "GPS stopped, open KEKE Manager"');
select is((select quiet_kind from public.trip_gps_watch where driver_id = tests.gp('D7')), 'no_pin',
  'P0-3: D7''s trip with no position at all is now watched');
select is(tests.wakes_to('D7') || '/' || tests.gps_notices('D7'), '0/0', 'P0-3: ... nothing sent at first sight');
select is((select quiet_since from public.trip_gps_watch where driver_id = tests.gp('S')), null::timestamptz, 'P0-3: S is live: no quiet spell');

select tests.gps_advance(25);
select tests.set_pin(tests.gp('S'), 'background', tests.noon());
select is(public.watch_trip_gps(tests.noon()), 3, 'P0-3: 25 minutes later: three actions');
select is(tests.wakes_to('D1') || '/' || tests.gps_notices('D1'), '2/1', 'P0-3: D1 (40 minutes quiet): woken again and told');
select is(tests.gps_notices('D6'), 1, 'P0-3: D6 is not told again within two hours');
select is(tests.gps_notices('D7'), 1, 'P0-3: D7 (no position for 25 minutes): told ...');
select ok(tests.gps_notice_bodies('D7') like 'GPS ჩართული არ არის.%', 'P0-3: ... "GPS is not on, open KEKE Manager and turn it on"');
select is(tests.wakes_to('D7'), 0, 'P0-3: ... and never woken silently (no trip GPS to restart)');
select is(tests.wakes_to('S') + tests.gps_notices('S'), 0, 'P0-3: S, live all along: nothing');

-- a position from before the trip does not count against it
delete from public.trip_gps_watch; delete from public.notifications;
select tests.set_pin(tests.gp('D6'), 'foreground', tests.noon() - interval '3 hours');
select public.watch_trip_gps(tests.noon());
select is(tests.gps_notices('D6'), 0,
  'P0-3: a trip whose driver''s last open-screen position is 3 hours old: not told the moment the watch first sees the trip');
select tests.gps_advance(25);
select tests.set_pin(tests.gp('S'), 'background', tests.noon());
select public.watch_trip_gps(tests.noon());
select is(tests.gps_notices('D6'), 1, 'P0-3: ... told once the trip has been quiet for 20 minutes');

-- two trips in progress at once: always the same one, so the limits hold
delete from public.trip_gps_watch; delete from public.notifications;
update public.bookings set status = 'in_progress' where id = tests.gp('FUT_C');
select tests.watch_seen('D1', tests.noon() - interval '1 hour');
select tests.set_pin(tests.gp('D1'), 'background', tests.noon() - interval '30 minutes');
do $$ begin for i in 1 .. 6 loop
  perform public.watch_trip_gps(tests.noon());
  perform tests.gps_advance(2);
  update public.bookings set updated_at = now() + make_interval(secs => i)
   where id = case when i % 2 = 0 then tests.gp('LIVE_A') else tests.gp('FUT_C') end;
end loop; end $$;
select is(tests.gps_notices('D1'), 1, 'P0-3: D1 with two trips in progress, the watch running six times in 12 minutes: told once');
update public.bookings set status = 'accepted' where id = tests.gp('FUT_C');

-- the whole day in one quiet spell: bounded
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
select tests.set_pin(tests.gp('D1'), 'background', tests.noon() - interval '15 minutes');
select tests.set_pin(tests.gp('S'), 'background', tests.noon());
select tests.set_pin(tests.gp('D6'), 'foreground', tests.noon());
delete from public.driver_locations where driver_id = tests.gp('D7');
update public.bookings set status = 'completed' where id = tests.gp('LIVE_C7');
do $$ begin for i in 1 .. 48 loop perform public.watch_trip_gps(tests.noon()); perform tests.gps_advance(10);
  perform tests.set_pin(tests.gp('S'), 'background', tests.noon()); perform tests.set_pin(tests.gp('D6'), 'foreground', tests.noon()); end loop; end $$;
select is(tests.wakes_to('D1'), 6, 'P0-3: eight hours quiet: 6 silent wake-ups in the spell, then no more');
select is(tests.gps_notices('D1'), 3, 'P0-3: ... and 3 notices, two hours apart, then no more');

-- a phone that reports now and then: bounded per trip, not per spell
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
select is(tests.flap_wakes('D1', 3), 12, 'P0-3: a phone that reports now and then: at most 12 wake-ups in the trip');
select ok(tests.gps_notices('D1') <= 3, 'P0-3: ... and at most 3 notices');
select tests.set_pin(tests.gp('D1'), 'background', now());
select public.watch_trip_gps();
select is((select quiet_since is null and trip_silent_total = 12 from public.trip_gps_watch where driver_id = tests.gp('D1')), true,
  'P0-3: live again: the spell ends, the trip''s count stays');
select tests.set_pin(tests.gp('D1'), 'background', now() - interval '30 minutes');
select public.watch_trip_gps();
select is(tests.wakes_to('D1'), 12, 'P0-3: quiet again later in the same trip: no more wake-ups');

-- by day only
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
select tests.watch_seen(x, tests.noon() - interval '10 hours') from unnest(array['D1', 'D6']) x;
select tests.set_pin(tests.gp('D6'), 'foreground', tests.noon() - interval '9 hours 30 minutes');
select tests.set_pin(tests.gp('D1'), 'background', tests.noon() - interval '9 hours 15 minutes');
select tests.set_pin(tests.gp('S'), 'background', tests.noon() - interval '9 hours');
select public.watch_trip_gps(tests.noon() - interval '9 hours');
select is(tests.gps_notices('D6') + tests.gps_notices('D1'), 0, 'P0-3: at 03:00 in Tbilisi nobody is told');
select is(tests.wakes_to('D1'), 1, 'P0-3: ... a trip''s GPS is still woken silently');

-- left open for half a day
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
select tests.watch_seen(x, tests.noon() - interval '14 hours') from unnest(array['D1', 'D6']) x;
select tests.set_pin(tests.gp('D6'), 'foreground', tests.noon() - interval '13 hours');
select tests.set_pin(tests.gp('D1'), 'background', tests.noon() - interval '13 hours');
select tests.set_pin(tests.gp('S'), 'background', tests.noon());
select is(public.watch_trip_gps(tests.noon()), 0, 'P0-3: a trip quiet for 13 hours (left open): nobody is told or woken');

-- the next trip has its own counts; an ended trip loses its watch
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
select tests.set_pin(tests.gp('D1'), 'background', now() - interval '15 minutes');
select tests.flap_wakes('D1', 2);
update public.bookings set status = 'completed' where id = tests.gp('LIVE_A');
update public.bookings set status = 'in_progress' where id = tests.gp('FUT_C');
delete from net.http_calls;
select tests.set_pin(tests.gp('D1'), 'background', now() - interval '15 minutes');
select public.watch_trip_gps();
select is(tests.wakes_to('D1'), 1, 'P0-3: D1''s next trip starts with its own counts: woken again');
select is((select tests.gname(booking_id) from public.trip_gps_watch where driver_id = tests.gp('D1')), 'FUT_C',
  'P0-3: ... watched for the new trip');
update public.bookings set status = 'completed' where id = tests.gp('LIVE_B6');
select public.watch_trip_gps();
select ok(not exists (select 1 from public.trip_gps_watch where driver_id = tests.gp('D6')), 'P0-3: D6''s trip ended: no watch left');
update public.bookings set status = 'accepted' where id = tests.gp('FUT_C');
update public.bookings set status = 'in_progress' where id in (tests.gp('LIVE_A'), tests.gp('LIVE_B6'), tests.gp('LIVE_C7'));

-- ============================================================ P0-2: finishing a trip, by every road
select is(tests.try_as(tests.gp('D1'), $$select public.complete_in_progress_booking_as_driver(tests.gp('LIVE_A'))$$), '1',
  'P0-2: D1 finishes his trip with the app''s call');
select is(tests.app_report(tests.gp('D1'), 'background', 42.0, 44.0), '0',
  'P0-2: ... his trip task''s next report (an app that did not stop it): skipped');
select is(tests.pins_seen_by(tests.gp('CA')), 'S', 'P0-2/P0-1: CA no longer sees D1, even before the tidy job');
select is(tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), now() + interval '3 minutes'), '0',
  'P0-2: ... nor any point recorded after the end');
update public.bookings set status = 'completed' where id = tests.gp('FLT_A');  -- KEKE ends the fleet trip
select tests.set_pin(tests.gp(x), 'foreground', now()) from unnest(array['D3', 'D5', 'D6']) x;  -- live open screens
select is(tests.app_report(tests.gp('S'), 'background', 42.0, 44.0), '0', 'P0-2: a trip KEKE ended: S''s trip task is skipped too');
select public.gps_tidy_pins();
select is(tests.pins(), 'D3,D5,D6', 'P0-2: the tidy job removes D1''s, S''s and H''s trip positions; live open screens and trips in progress stay');
select is(tests.pins_seen_by(tests.gp('CA')), '', 'P0-2: CA sees nobody once its trips are over');

-- ============================================================ jobs and rights
select is((select schedule || ' ' || command from cron.job where jobname = 'gps-tidy-pins'),
  '*/5 * * * * select public.gps_tidy_pins();', 'jobs: the tidy job runs every 5 minutes');
select is((select string_agg(jobname || ' ' || schedule || ' ' || command, ' | ' order by jobname) from cron.job where jobname <> 'gps-tidy-pins'),
  'trail-cleanup 17 3 * * * delete from public.driver_location_trail where recorded_at < now() - interval ''30 days''; | watch-trip-gps */2 * * * * select public.watch_trip_gps();',
  'jobs: production''s two GPS jobs are unchanged (the watch is still called without arguments)');
select is((select string_agg(f || ':' || r, ' ' order by f, r) from
             unnest(array['public.watch_trip_gps(timestamptz)', 'public.gps_tidy_pins(timestamptz)',
                          'public.gps_trip_accepts_point(uuid,uuid,timestamptz)', 'public.driver_locations_trip_guard()',
                          'public.driver_location_trail_keep_trip_points()', 'public.driver_locations_server_time()']) f,
             unnest(array['anon', 'authenticated']) r
            where has_function_privilege(r, f, 'execute')), null,
  'rights: no app (signed in or not) can run any of the new functions - not the watch, not the tidy job, not the trip check');
select ok(has_function_privilege('service_role', 'public.watch_trip_gps(timestamptz)', 'execute')
          and has_function_privilege('service_role', 'public.gps_tidy_pins(timestamptz)', 'execute'),
  'rights: the server runs the watch and the tidy job');

select * from finish();
rollback;
