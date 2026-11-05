-- GPS P0-1, P0-2, P0-3 on a database with all three migrations
-- (20261104150000, 20261104150100, 20261104150200). Three companies, two
-- admins, a fleet owner with two drivers and nine other drivers, every booking
-- state, a three-day tour; fake data only
-- (fixtures/gps_p0_seed.sql). Nothing is sent anywhere: wake-ups and
-- notifications land in the shim's net.http_calls and in notifications.
-- Everything is rolled back.
begin;
\ir fixtures/gps_p0_seed.sql
select plan(207);

-- ============================================================ P0-1: who reads where a driver is
select is(tests.pins_seen_by(tests.gp('CA')), 'D1,S',
  'P0-1: CA sees exactly the drivers of its two trips in progress (D1; S, given by fleet owner H)');
select is(tests.pins_seen_by(tests.gp('CB')), 'D6,D9',
  'P0-1: CB sees D6 and D9 (its trip and its tour in progress) - not D1 (finished yesterday), not D2 (cancelled)');
select is(tests.pins_seen_by(tests.gp('CC')), '',
  'P0-1: CC sees nobody - D1''s job is next week, D4 declined, D7 (in progress) sends no position');
select is(tests.pins_seen_by(tests.gp('ADM')), 'D1,D6,D9,S',
  'P0-1: KEKE''s admin sees the drivers on a trip in progress - not D8 or S2 after their trips, not drivers without a trip');
select is(tests.pins_seen_by(tests.gp('ADM2')), 'D1,D6,D9,S', 'P0-1: ... the same for every admin');
select is(tests.pins_seen_by(tests.gp('H')), 'H,S',
  'P0-1: the fleet owner sees himself and S on a trip - not S2, whose trip ended and whose old app keeps sending');
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
select is((select started_at from public.gps_trip_start where booking_id = tests.gp('FUT_C')), now(),
  'P0-2: the server notes when the trip started, by its own clock');
update public.bookings set status = 'accepted' where id = tests.gp('FUT_C');
select is(tests.pins_seen_by(tests.gp('CC')), '', 'P0-1: ... and not while it is only accepted');

-- the fleet owner's driver on a trip: through the fleet, or through a trip he gave out
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code)
values (tests.gp('NEXT_S2'), tests.gp('CC'), tests.gp('S2'), 'transfer', 'in_progress', (now() - interval '20 minutes')::text,
        'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2, 'GPS-NEXT_S2');
insert into tests.gnames values (tests.gp('NEXT_S2'), 'NEXT_S2') on conflict do nothing;
select is(tests.pins_seen_by(tests.gp('H')), 'H,S,S2', 'P0-1: S2 on a trip (he took it himself): his fleet owner sees him');
select is(tests.pins_seen_by(tests.gp('ADM')), 'D1,D6,D9,S,S2', 'P0-1: ... and so does the admin');
update public.driver_fleet set status = 'rejected' where sub_driver_id = tests.gp('S2');
select is(tests.pins_seen_by(tests.gp('H')), 'H,S', 'P0-1: S2 no longer in H''s fleet: H does not see him on someone else''s trip');
update public.bookings set host_driver_id = tests.gp('H') where id = tests.gp('NEXT_S2');
select is(tests.pins_seen_by(tests.gp('H')), 'H,S,S2', 'P0-1: ... but does on a trip H gave him');
delete from public.bookings where id = tests.gp('NEXT_S2');
update public.driver_fleet set status = 'accepted' where sub_driver_id = tests.gp('S2');
select is(tests.pins_seen_by(tests.gp('H')), 'H,S', 'P0-1: S2''s trip over: H no longer sees him');

-- a company cannot make itself a trip with a driver through a convoy's coordinator row
-- (H can take jobs: he drives too, with his own approved vehicles)
insert into tests.gnames values (tests.gp('MASTER_CB'), 'MASTER_CB') on conflict do nothing;
select is(tests.try_as(tests.gp('CB'), format($$insert into public.bookings (id, company_id, driver_id, is_group_master, status, kind,
            date_display, from_location, to_location, price_gel, vehicle_type, vehicle_class, passengers)
          values (%L, %L, %L, true, 'pending', 'transfer', '2026-11-20 10:00', 'Test A', 'Test B', 100, 'sedan', 'comfort', 2)$$,
          tests.gp('MASTER_CB'), tests.gp('CB'), tests.gp('H')))
          || ' ' || tests.try_as(tests.gp('CB'), format($$update public.bookings set status = 'in_progress' where id = %L$$, tests.gp('MASTER_CB'))),
  '1 1', 'P0-1: CB writes a convoy coordinator row naming driver H and marks it "in progress" itself (the booking rules let it) ...');
select is(tests.pins_seen_by(tests.gp('CB')) || '|' || tests.pins_seen_by(tests.gp('ADM')), 'D6,D9|D1,D6,D9,S',
  'P0-1: ... CB still does not see H, the admin sees no more than before: a coordinator row is not a trip');
select is(tests.app_trail(tests.gp('H'), tests.gp('MASTER_CB'), now() - interval '1 minute'), '0',
  'P0-2: ... no road point is stored for it');
select public.watch_trip_gps();
select ok(not exists (select 1 from public.trip_gps_watch where driver_id = tests.gp('H')),
  'P0-3: ... and the watch does not take it for a trip of H''s');
delete from public.bookings where id = tests.gp('MASTER_CB');
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;

-- the admin's one exception: a reasoned, short, personal, logged opening
select is(tests.admin_open(tests.gp('ADM'), tests.gp('D8'), 'check', 30), '22023', 'P0-1: opening a driver''s position needs a reason of at least 10 characters');
select is(tests.admin_open(tests.gp('ADM'), tests.gp('D8'), 'driver reports his phone lost', 61)
          || ' ' || tests.admin_open(tests.gp('ADM'), tests.gp('D8'), 'driver reports his phone lost', 0)
          || ' ' || tests.admin_open(tests.gp('ADM'), tests.gp('D8'), 'driver reports his phone lost', null),
  '22023 22023 22023', 'P0-1: ... for 1 to 60 minutes');
select is(tests.admin_open(tests.gp('ADM'), tests.gp('CA'), 'driver reports his phone lost', 30), '22023', 'P0-1: ... and only a driver''s');
select is(tests.admin_open(tests.gp('D1'), tests.gp('D8'), 'driver reports his phone lost', 30)
          || ' ' || tests.admin_open(tests.gp('CA'), tests.gp('D8'), 'driver reports his phone lost', 30)
          || ' ' || tests.admin_open(tests.gp('H'), tests.gp('S2'), 'driver reports his phone lost', 30),
  '42501 42501 42501', 'P0-1: a driver, a company or a fleet owner cannot open anyone''s position');
select ok(not has_function_privilege('anon', 'public.gps_admin_open_access(uuid,text,integer)', 'execute')
          and not has_function_privilege('anon', 'public.gps_admin_close_access(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.gps_fleet_owner_sees(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.gps_road_point_visible(text,bigint)', 'execute'),
  'P0-1: someone not signed in cannot even call it (nor the fleet owner''s or the road''s read checks)');
select is(tests.try_as(tests.gp('CA'), format('select 1 where public.gps_fleet_owner_sees(%L::uuid)', tests.gp('S'))), '0',
  'P0-1: asked by anyone but his fleet owner, the fleet check says nothing about S''s trip');
select is(tests.admin_open(tests.gp('ADM'), tests.gp('D8'), 'driver reports his phone lost after the trip', 30), '1',
  'P0-1: ADM opens D8''s position for 30 minutes, saying why');
select is(tests.pins_seen_by(tests.gp('ADM')), 'D1,D6,D8,D9,S', 'P0-1: ... ADM sees D8 now');
select is(tests.pins_seen_by(tests.gp('ADM2')), 'D1,D6,D9,S', 'P0-1: ... only ADM: another admin does not');
select is(tests.try_as(tests.gp('ADM2'), 'select * from public.gps_admin_access'), '1', 'P0-1: every admin reads the log of openings');
select is(tests.try_as(tests.gp('D8'), 'select * from public.gps_admin_access')
          || ' ' || tests.try_as(tests.gp('CA'), 'select * from public.gps_admin_access'), '0 0',
  'P0-1: ... drivers and companies read nothing of it');
select is((select tests.gname(admin_id) || ' ' || tests.gname(driver_id) || ' ' || reason || ' ' || (expires_at - opened_at)::text
             from public.gps_admin_access),
  'ADM D8 driver reports his phone lost after the trip 00:30:00', 'P0-1: the log keeps who, whose position, why and for how long');
select is(tests.try_as(tests.gp('ADM'), $$update public.gps_admin_access set expires_at = now() + interval '1 day'$$)
          || ' ' || tests.try_as(tests.gp('ADM'), 'delete from public.gps_admin_access')
          || ' ' || tests.try_as(tests.gp('ADM'), $$insert into public.gps_admin_access (admin_id, driver_id, reason, expires_at)
                                                    values (tests.gp('ADM'), tests.gp('D2'), 'no reason needed here', now() + interval '1 day')$$),
  '42501 42501 42501', 'P0-1: nobody can lengthen, delete or write an opening past the rules');
update public.gps_admin_access set opened_at = now() - interval '31 minutes', expires_at = now() - interval '1 minute';
select is(tests.pins_seen_by(tests.gp('ADM')), 'D1,D6,D9,S', 'P0-1: 30 minutes later the opening has ended by itself');
select is(tests.admin_open(tests.gp('ADM'), tests.gp('D8'), 'second look, driver still unreachable', 10), '1', 'P0-1: ADM opens it again');
select is(tests.try_as(tests.gp('D1'), format('select public.gps_admin_close_access(%L::uuid)', tests.gp('D8'))), '42501',
  'P0-1: a driver cannot close it');
select is(tests.try_as(tests.gp('ADM'), format('select public.gps_admin_close_access(%L::uuid)', tests.gp('D8'))), '1',
  'P0-1: ADM closes it early ...');
select is(tests.pins_seen_by(tests.gp('ADM')), 'D1,D6,D9,S', 'P0-1: ... and no longer sees D8');
select is((select count(*)::int from public.gps_admin_access), 2, 'P0-1: both openings stay in the log');

-- the road: who reads it
select is(tests.trail_seen_by(tests.gp('CA')), 'DONE_A8:1,DONE_S2:2,FLT_A:1,LIVE_A:3',
  'P0-2: CA reads the road of its own trips (running, and the finished ones up to their end)');
select is(tests.trail_seen_by(tests.gp('CB')), 'DONE_B:2,TOUR_9:2', 'P0-2: CB reads the road of its finished trip and of its tour');
select is(tests.trail_seen_by(tests.gp('CC')), '', 'P0-2: CC reads no road');
select is(tests.trail_seen_by(tests.gp('H')), 'DONE_S2:2,FLT_A:1', 'P0-2: fleet owner H reads the roads of his drivers'' trips');
select is(tests.trail_seen_by(tests.gp('ADM')), 'DONE_A8:1,DONE_B:2,DONE_S2:2,FLT_A:1,LIVE_A:3,TOUR_9:2', 'P0-2: an admin reads every trip''s road');
set local session_replication_role = replica;  -- points an installed app might have sent before P0-2
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
select tests.gp('D1'), tests.gp('DONE_B'), b.completed_at + x, 41.72, 44.81
  from public.bookings b, unnest(array[interval '1 minute', interval '3 minutes', interval '20 hours']) x
 where b.id = tests.gp('DONE_B');
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
values (tests.gp('D2'), tests.gp('CNL_B'), now() - interval '7 minutes', 41.72, 44.81);
set local session_replication_role = origin;
select is(tests.trail_seen_by(tests.gp('CB')), 'DONE_B:2,TOUR_9:2',
  'P0-2: points stored before P0-2 that the server never checked (after the trip, a cancelled booking''s): CB reads none of them');
select is(tests.trail_seen_by(tests.gp('ADM')) || '|' || tests.trail_seen_by(tests.gp('H')),
  'DONE_A8:1,DONE_B:2,DONE_S2:2,FLT_A:1,LIVE_A:3,TOUR_9:2|DONE_S2:2,FLT_A:1', 'P0-2: ... nor the admin, nor a fleet owner');
-- a trip cancelled after it had started: its road up to the cancellation stays the company's
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code, cancelled_at)
values (tests.gp('CNL_RUN'), tests.gp('CC'), tests.gp('D4'), 'transfer', 'cancelled', (now() - interval '1 hour')::text,
        'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2, 'GPS-CNL_RUN', now() - interval '10 minutes');
insert into tests.gnames values (tests.gp('CNL_RUN'), 'CNL_RUN') on conflict do nothing;
set local session_replication_role = replica;
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude, created_at)
values (tests.gp('D4'), tests.gp('CNL_RUN'), now() - interval '31 minutes', 41.7, 44.8, now() - interval '30 minutes'),
       (tests.gp('D4'), tests.gp('CNL_RUN'), now() - interval '21 minutes', 41.7, 44.8, now() - interval '20 minutes'),
       (tests.gp('D4'), tests.gp('CNL_RUN'), now() - interval '1 minute', 41.7, 44.8, now());
update public.driver_location_trail set trip_check = 'trip'
 where booking_id = tests.gp('CNL_RUN') and created_at < now() - interval '15 minutes';  -- the two that came in during the trip
set local session_replication_role = origin;
select is(tests.trail_seen_by(tests.gp('CC')), 'CNL_RUN:2',
  'P0-2: CC reads the road of its trip cancelled under way, up to the cancellation (2 of 3 points)');
select is(tests.trail_seen_by(tests.gp('D1')), 'DONE_B:5,LIVE_A:3', 'P0-2: the driver still reads all of his own road');

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
  'P0-2: the open GPS screen without a trip still works (the driver''s own map)');
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
  'P0-2: a point dated 5 minutes ahead by a phone whose clock was measured right (a time still to come): kept ...');
select is(tests.trail_seen_by(tests.gp('CA')) ~ 'LIVE_A:4(,|$)' and tests.trail_seen_by(tests.gp('D1')) ~ 'LIVE_A:5(,|$)', true,
  'P0-2: ... for the driver only: CA does not read it');
select is(tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), now() - interval '90 minutes'), '0',
  'P0-2: a point taken before the trip started (an hour ago; say, the GPS screen open on the way): skipped');
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

-- ============================================================ P0-2: the phone's clock is checked
select is(tests.clock_skew(tests.gp('D1')), -0.4::double precision,
  'P0-2: every position report carries the phone''s clock; the server measured D1''s: right (0.4 s of network delay)');
select is(tests.clock_skew(tests.gp('D2')), null::double precision, 'P0-2: ... and nothing for a report someone else tried to write for D2');
-- S2: an app from before 24 October (no mode), still sending after his trip, its clock an hour behind
select is(tests.app_report(tests.gp('S2'), null, 41.73, 44.83, now() - interval '1 hour'), '1',
  'P0-2: S2''s old app reports after his trip: stored (seen by nobody but him, P0-1)');
select is(tests.clock_skew(tests.gp('S2')), -3600::double precision, 'P0-2: ... his phone''s clock: an hour behind');
select is(tests.app_trail(tests.gp('S2'), tests.gp('DONE_S2'), now() - interval '1 hour'), '0',
  'P0-2: ... so a point it dates "an hour ago" (before his trip ended, by that clock) is kept out of the finished trip''s road');
select is(tests.app_report(tests.gp('S2'), null, 41.73, 44.83), '1', 'P0-2: S2 sets his clock right and reports again');
select is(tests.clock_skew(tests.gp('S2')), -0.4::double precision, 'P0-2: ... measured right');
select is(tests.app_trail(tests.gp('S2'), tests.gp('DONE_S2'), now() - interval '15 minutes'), '0',
  'P0-2: ... but a clock found off since the trip began cannot date its late points: still kept out');
-- D3: a trip completed 5 minutes ago; his phone's clock never seen, then seen off, then right since long ago
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code)
values (tests.gp('DONE_D3'), tests.gp('CC'), tests.gp('D3'), 'transfer', 'completed', (now() - interval '1 hour')::text,
        'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2, 'GPS-DONE_D3');
update public.bookings set completed_at = now() - interval '5 minutes' where id = tests.gp('DONE_D3');
insert into tests.gnames values (tests.gp('DONE_D3'), 'DONE_D3') on conflict do nothing;
delete from public.gps_device_clock where driver_id = tests.gp('D3');  -- as if his phone never reported since the release
select is(tests.app_trail(tests.gp('D3'), tests.gp('DONE_D3'), now() - interval '7 minutes'), '1',
  'P0-2: a late point from a phone whose clock the server never saw: kept ...');
select is(tests.trail_seen_by(tests.gp('CC')) || '|' || tests.trail_seen_by(tests.gp('D3')), 'CNL_RUN:2|DONE_D3:1',
  'P0-2: ... for the driver only: CC does not read it');
-- after his trip, D3's old app (its trip task still running) moves its clock 40 minutes back
select is(tests.app_report(tests.gp('D3'), 'background', 41.79, 44.89, now() - interval '40 minutes'), '0',
  'P0-2: D3''s trip task reports after the trip: skipped ...');
select is(tests.clock_skew(tests.gp('D3')), -2400::double precision, 'P0-2: ... but the report''s clock is still read: 40 minutes behind');
select is(tests.app_trail(tests.gp('D3'), tests.gp('DONE_D3'), now() - interval '40 minutes'), '0',
  'P0-2: ... so a point it dates "40 minutes ago" (before the end, by that clock) is kept out of the finished trip');
select is(tests.app_trail(tests.gp('D3'), tests.gp('DONE_D3'), now() - interval '6 minutes'), '0',
  'P0-2: ... as is any late point from that phone now');
update public.gps_device_clock set skew = interval '-0.4 seconds', off_seen_at = now() - interval '3 days', ok_since = now(), measured_at = now()
 where driver_id = tests.gp('D3');  -- found off three days ago, unseen since, right again only now
select is(tests.app_trail(tests.gp('D3'), tests.gp('DONE_D3'), now() - interval '9 minutes'), '1',
  'P0-2: a phone whose clock is right now, but was last seen off and not since: its late point is kept ...');
select is(tests.trail_seen_by(tests.gp('CC')), 'CNL_RUN:2', 'P0-2: ... for the driver only (it may carry the old wrong time)');
update public.gps_device_clock set off_seen_at = now() - interval '2 days', ok_since = now() - interval '2 days' + interval '1 minute'
 where driver_id = tests.gp('D3');  -- found off two days ago, and right at every report since
select is(tests.app_trail(tests.gp('D3'), tests.gp('DONE_D3'), now() - interval '8 minutes'), '1',
  'P0-2: a clock found off two days before the trip and right since: its late points count ...');
select is(tests.trail_seen_by(tests.gp('CC')), 'CNL_RUN:2,DONE_D3:1', 'P0-2: ... CC reads that one');
-- S on FLT_A: his phone last reported 75 minutes ago, then had no internet; fleet owner H finishes the trip for him
select tests.set_pin(tests.gp('S'), 'background', now() - interval '75 minutes');
update public.gps_device_clock set measured_at = now() - interval '75 minutes', ok_since = now() - interval '3 hours'
 where driver_id = tests.gp('S');  -- right at every report for hours, the last one 75 minutes ago
update public.bookings set status = 'completed' where id = tests.gp('FLT_A');
select is(tests.app_trail(tests.gp('S'), tests.gp('FLT_A'), now() - interval '15 minutes')
          || tests.app_trail(tests.gp('S'), tests.gp('FLT_A'), now() - interval '5 minutes'), '11',
  'P0-2: back online, S''s phone first sends the road it kept: stored (nothing is lost) ...');
select is(tests.trail_seen_by(tests.gp('CA')) ~ 'FLT_A:1(,|$)' and tests.trail_seen_by(tests.gp('S')) ~ 'FLT_A:3', true,
  'P0-2: ... for S only, while his phone''s clock has not been seen since before the end');
select is(tests.app_report(tests.gp('S'), 'background'), '0', 'P0-2: his phone reports (skipped: the trip is over) - its clock is seen, right');
select is(tests.app_trail(tests.gp('S'), tests.gp('FLT_A'), now() - interval '1 minute'), '1', 'P0-2: ... its next late point from before the end ...');
select is(tests.trail_seen_by(tests.gp('CA')) ~ 'FLT_A:2' and tests.trail_seen_by(tests.gp('H')) ~ 'FLT_A:2', true,
  'P0-2: ... CA and H read it');
update public.bookings set status = 'in_progress' where id = tests.gp('FLT_A');
select tests.set_pin(tests.gp('S'), 'background', now());
-- old cached fixes
select is(tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), now() - interval '40 days')
          || tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), timestamptz '2007-01-01 10:00+00'), '00',
  'P0-2: a point the phone dates 40 days back, or in 2007 (an old cached fix): kept out');
select is(tests.app_trail(tests.gp('D1'), tests.gp('DONE_B'),
            (select min(recorded_at) - interval '3 hours' from public.driver_location_trail where booking_id = tests.gp('DONE_B'))), '0',
  'P0-2: a late point dated hours before the finished trip started: kept out');
-- D6 on a running trip, his phone two hours ahead
select is(tests.app_report(tests.gp('D6'), 'foreground', 41.7, 44.8, now() + interval '2 hours'), '1', 'P0-2: D6, clock two hours ahead, reports');
select is(tests.clock_skew(tests.gp('D6')), 7200::double precision, 'P0-2: ... measured: two hours ahead');
select is(tests.app_trail(tests.gp('D6'), tests.gp('LIVE_B6'), now() + interval '1 hour 50 minutes')
          || tests.app_trail(tests.gp('D6'), tests.gp('LIVE_B6'), now() + interval '1 year'), '11',
  'P0-2: points of his running trip, dated by that clock (or a year ahead): kept ...');
select is(tests.trail_seen_by(tests.gp('CB')) !~ 'LIVE_B6' and tests.trail_seen_by(tests.gp('ADM')) !~ 'LIVE_B6'
          and tests.trail_seen_by(tests.gp('D6')) ~ 'LIVE_B6:2', true,
  'P0-2: ... for the driver only: their times cannot be trusted, so CB and the admin read none of them');
select is(tests.app_trail(tests.gp('D6'), tests.gp('LIVE_B6'), now() + interval '2 hours' - interval '1 day'), '0',
  'P0-2: a point that clock dates a day back (before the trip started): skipped');
select is(tests.app_report(tests.gp('D6'), 'foreground', 41.7, 44.8, now() + interval '2 hours 10 seconds'), '1', 'P0-2: D6 reports, 10 s of delay');
select is(tests.clock_skew(tests.gp('D6')), 7200::double precision, 'P0-2: ... a few seconds of delay do not move the measured difference');
select is(tests.app_report(tests.gp('D6'), 'foreground', 41.7, 44.8, now() + interval '2 hours 45 seconds'), '1', 'P0-2: D6''s clock moves by 45 s');
select is(tests.clock_skew(tests.gp('D6')), 7245::double precision, 'P0-2: ... a real change of more than 30 s is taken');
select is(tests.app_report(tests.gp('D6'), 'foreground'), '1', 'P0-2: D6 sets his clock right');
select is(tests.app_trail(tests.gp('D6'), tests.gp('LIVE_B6'), now() - interval '1 minute'), '1', 'P0-2: ... his next point ...');
select is(tests.trail_seen_by(tests.gp('CB')) ~ 'LIVE_B6:1', true, 'P0-2: ... is the trip''s: CB reads it');
-- when a point reached the server is the server's to say; the fleet owner's own phone is not on the trip
select is(tests.app_trail(tests.gp('D1'), tests.gp('LIVE_A'), now() - interval '6 minutes', now() - interval '10 days'), '1',
  'P0-2: an app sends a point with its own "reached the server" time');
select is(tests.trail_created(tests.gp('D1'), now() - interval '6 minutes'), now(), 'P0-2: ... the server keeps its own time instead');
select is(tests.app_trail(tests.gp('H'), tests.gp('FLT_A'), now() - interval '2 minutes'), '0',
  'P0-2: fleet owner H''s phone on the trip S drives: not put into its road');
select is(tests.try_as(tests.gp('D5'), $$update public.driver_locations set latitude = 41.8 where driver_id = tests.gp('D5')$$), '1',
  'P0-2: an update that sends no time still works ...');
select is(tests.clock_skew(tests.gp('D5')), -0.4::double precision, 'P0-2: ... and says nothing about the clock');
select is((select string_agg(k || ':' || n, ',' order by k) from (select coalesce(trip_check, 'unchecked') k, count(*) n from public.driver_location_trail
             where booking_id in (tests.gp('DONE_D3'), tests.gp('LIVE_B6')) group by 1) x), 'late:1,trip:1,unchecked:4',
  'P0-2: every point the server stored says how it was let in (during the trip, late, or unchecked)');
select is((select string_agg(kind || ':' || n, ' ' order by kind) from (select kind, sum(n) n from public.gps_skip_counts group by kind) x),
          'background_position:5 road_point:19 road_point_unchecked:8',
  'P0-2: what was skipped or kept unchecked is counted by day and driver, for watching a rollout');
select is(tests.pins(), 'D1,D2,D3,D4,D5,D6,D8,D9,H,S,S2', 'P0-2: before the tidy job: eleven positions');
create temp table history_before as select tests.history_rows() h, tests.trail_seen_by(tests.gp('CA')) ca_road;
select is(public.gps_tidy_pins(), 3, 'P0-2: the tidy job removes three');
select is(tests.pins(), 'D1,D3,D5,D6,D9,H,S,S2',
  'P0-2: gone: D8 (left over from a finished trip), D4 (a trip task''s, two days old), D2 (two days old); kept: trips in progress, live open screens, S2''s fresh old-app position (nobody else sees it)');
select is(tests.history_rows(), (select h from history_before),
  'item 4: the tidy job removes positions only - every road point, passenger mark, tour day and old location row is still there');
select is(tests.trail_seen_by(tests.gp('CA')), (select ca_road from history_before), 'item 4: CA reads exactly the same roads after the tidy job');
select is(tests.trail_seen_by(tests.gp('CA')) ~ 'DONE_S2:2', true, 'item 4: ... among them the finished trip of S2');
select tests.set_pin(tests.gp('D3'), 'foreground', now() - interval '14 minutes');
select tests.set_pin(tests.gp('D5'), 'foreground', now() - interval '16 minutes');
select tests.set_pin(tests.gp('S2'), null, now() - interval '16 minutes');
select is(public.gps_tidy_pins(), 2, 'P0-2: an open-screen or old-app position without a trip goes after 15 minutes ...');
select is(tests.pins(), 'D1,D3,D6,D9,H,S', 'P0-2: ... (D5 and S2, 16 minutes) and not before (D3, 14 minutes): the next trip never starts with an old one');
select is(tests.history_rows(), (select h from history_before), 'item 4: ... still no road point, mark or tour day touched');
select tests.set_pin(tests.gp('D5'), 'foreground', now());

-- ============================================================ item 4: the 30-day road clean-up
set local session_replication_role = replica;
insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude, created_at, trip_check)
values (tests.gp('D1'), tests.gp('DONE_B'), now() - interval '31 days 1 minute', 41.7, 44.8, now() - interval '31 days', 'trip'),
       (tests.gp('D1'), tests.gp('DONE_B'), now() - interval '33 days', 41.7, 44.8, now() - interval '33 days', null),
       (tests.gp('D1'), tests.gp('LIVE_A'), now() - interval '40 days', 41.7, 44.8, now(), 'trip');
set local session_replication_role = origin;
create temp table roads_before as select tests.trail_points(tests.gp('LIVE_A')) live_a, tests.trail_seen_by(tests.gp('CB')) cb;
select is(tests.run_trail_cleanup(), 2,
  'item 4: the clean-up removes what reached the server more than 30 days ago (the published privacy policy: no long-term GPS history) ...');
select is(tests.trail_created(tests.gp('D1'), now() - interval '40 days'), now(),
  'item 4: ... counted from arrival: a point that came in today stays, however old its phone''s date');
select is(tests.trail_points(tests.gp('LIVE_A')) || ' ' || substring(tests.trail_seen_by(tests.gp('CB')) from 'DONE_B:([0-9]+)')::int,
          (select live_a || ' ' || (substring(cb from 'DONE_B:([0-9]+)')::int - 1) from roads_before),
  'item 4: ... and nothing younger: the running trip''s road is whole; of CB''s, only the 31-day-old point went');

-- ============================================================ item 3: a multi-day tour, start to end
select is(tests.app_report(tests.gp('D9'), 'background'), '1', 'tour: D9''s trip task on day 3: stored');
update public.gps_device_clock set ok_since = now() - interval '47 hours'
 where driver_id = tests.gp('D9');  -- his phone has reported all through the tour, its clock right
select is(tests.pins_seen_by(tests.gp('CB')) ~ 'D9' and tests.pins_seen_by(tests.gp('ADM')) ~ 'D9', true,
  'tour: CB and the admin see D9 through the whole tour');
select is(tests.app_trail(tests.gp('D9'), tests.gp('TOUR_9'), now() - interval '30 hours'), '1',
  'tour: a point from day 2 sent only now (no internet in the mountains): stored');
select is(tests.try_as(tests.gp('D9'), format('select public.close_tour_day(%L::uuid, 2, 10650)', tests.gp('TOUR_9')))
          || ' ' || tests.try_as(tests.gp('D9'), format('select public.close_tour_day(%L::uuid, 3, 10800)', tests.gp('TOUR_9'))),
  '1 1', 'tour: D9 closes day 2 and day 3');
select is((select count(*)::int from public.booking_day_logs where booking_id = tests.gp('TOUR_9')), 3, 'tour: ... three days closed');
select is(tests.try_as(tests.gp('D9'), format('select public.complete_tour_booking_as_driver(%L::uuid)', tests.gp('TOUR_9'))), '1',
  'tour: D9 finishes the tour');
select is((select status || ' ' || (completed_at = now())::text from public.bookings where id = tests.gp('TOUR_9')), 'completed true',
  'tour: ... it is completed, now');
select is(tests.app_report(tests.gp('D9'), 'background'), '0', 'tour: his trip task after the tour: skipped');
select is(tests.pins_seen_by(tests.gp('CB')) || '|' || tests.pins_seen_by(tests.gp('ADM')), 'D6|D1,D6,S',
  'tour: CB and the admin no longer see D9');
select is(tests.app_trail(tests.gp('D9'), tests.gp('TOUR_9'), now() - interval '5 minutes'), '1',
  'tour: a point from before the end, sent just after it (his clock checked): stored');
select is(tests.trail_seen_by(tests.gp('CB')) ~ 'TOUR_9:4', true, 'tour: CB reads the whole road of the finished tour (all 4 points)');
select is(public.tour_day_count(tests.gp('TOUR_9')), 3, 'tour: the tour still has its three days');
select public.gps_tidy_pins();
select is((select count(*)::int from public.booking_day_logs where booking_id = tests.gp('TOUR_9'))
          || ' ' || tests.trail_points(tests.gp('TOUR_9')), '3 4', 'tour: the tidy job leaves its days and its road alone');

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

-- a phone that reports now and then: bounded per day, not per spell
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
select is(tests.flap_wakes('D1', 3), 12, 'P0-3: a phone that reports now and then: at most 12 wake-ups a day');
select ok(tests.gps_notices('D1') <= 3, 'P0-3: ... and at most 3 notices');
select tests.set_pin(tests.gp('D1'), 'background', now());
select public.watch_trip_gps();
select is((select quiet_since is null and trip_silent_total = 12 from public.trip_gps_watch where driver_id = tests.gp('D1')), true,
  'P0-3: live again: the spell ends, the day''s count stays');
select tests.set_pin(tests.gp('D1'), 'background', now() - interval '30 minutes');
select public.watch_trip_gps();
select is(tests.wakes_to('D1'), 12, 'P0-3: quiet again later the same day: no more wake-ups');
-- the next day of the same trip (a multi-day tour): the same help again
select tests.set_pin(tests.gp('D1'), 'background', now() + interval '1 day' - interval '15 minutes');
select public.watch_trip_gps(now() + interval '1 day');
select is(tests.wakes_to('D1'), 13, 'P0-3: the next day of the same trip (a multi-day tour): woken again');

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

-- a trip left "in progress" ten days ago, first seen by the watch (as on the day the migration runs)
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code)
values (tests.gp('LEFT_4'), tests.gp('CC'), tests.gp('D4'), 'transfer', 'in_progress', (now() - interval '10 days')::text,
        'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2, 'GPS-LEFT_4');
select tests.set_pin(tests.gp('D4'), 'background', now() - interval '10 days');
select public.watch_trip_gps(tests.noon());
select tests.gps_advance(25);
select public.watch_trip_gps(tests.noon());
select is(tests.wakes_to('D4') || '/' || tests.gps_notices('D4'), '0/0',
  'P0-3: a trip left in progress for ten days, first seen now: its driver is neither woken nor told (his phone would report again)');
update public.bookings set date_display = '25.10.2026, 10:00' where id = tests.gp('LEFT_4');
select public.watch_trip_gps(tests.noon());
select is(tests.wakes_to('D4'), 1,
  'P0-3: a start date typed as free text is not guessed at: that trip is watched like any other');
delete from public.bookings where id = tests.gp('LEFT_4');

-- one trip's unreadable day list never stops the watch for the others
delete from public.trip_gps_watch; delete from net.http_calls; delete from public.notifications;
update public.bookings set tour_days = '{"broken": true}'::jsonb, itinerary = '"x"'::jsonb where id = tests.gp('LIVE_B6');
select tests.watch_seen('D1', now() - interval '1 hour');
select tests.set_pin(tests.gp('D1'), 'background', now() - interval '15 minutes');
select lives_ok('select public.watch_trip_gps()', 'P0-3: a company writes a day list that cannot be read into its trip: the watch still runs ...');
select is(tests.wakes_to('D1'), 1, 'P0-3: ... and still wakes the other trips'' drivers');
update public.bookings set tour_days = null, itinerary = '[]'::jsonb where id = tests.gp('LIVE_B6');

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
select tests.set_pin(tests.gp('S2'), null, now());  -- S2's old app keeps sending
select public.gps_tidy_pins();
select is(tests.pins(), 'D3,D5,D6,S2', 'P0-2: the tidy job removes D1''s, S''s and H''s trip positions; live open screens and trips in progress stay');
select is(tests.pins_seen_by(tests.gp('CA')), '', 'P0-2: CA sees nobody once its trips are over');
select is(tests.pins_seen_by(tests.gp('H')) || '|' || tests.pins_seen_by(tests.gp('ADM')), '|D6',
  'P0-1: the fleet owner sees nobody once his drivers'' trips are over - not S2''s old app that keeps sending; the admin only D6, still on a trip');
select is(tests.trail_seen_by(tests.gp('CA')) ~ 'LIVE_A:', true, 'P0-1: CA still reads the road of the trip D1 just finished');

-- ============================================================ jobs and rights
select is((select schedule || ' ' || command from cron.job where jobname = 'gps-tidy-pins'),
  '*/5 * * * * select public.gps_tidy_pins();', 'jobs: the tidy job runs every 5 minutes');
select is((select string_agg(jobname || ' ' || schedule || ' ' || command, ' | ' order by jobname) from cron.job where jobname <> 'gps-tidy-pins'),
  'trail-cleanup 17 3 * * * delete from public.driver_location_trail where created_at < now() - interval ''30 days''; | watch-trip-gps */2 * * * * select public.watch_trip_gps();',
  'jobs: the road clean-up keeps its schedule and its 30 days, counted from arrival; the watch is still called without arguments');
select is((select string_agg(f || ':' || r, ' ' order by f, r) from
             unnest(array['public.watch_trip_gps(timestamptz)', 'public.gps_tidy_pins(timestamptz)',
                          'public.gps_road_point_kind(uuid,uuid,timestamptz)', 'public.driver_locations_trip_guard()',
                          'public.driver_location_trail_keep_trip_points()', 'public.driver_locations_server_time()',
                          'public.driver_locations_device_clock()', 'public.gps_count_skip(text,uuid)',
                          'public.bookings_gps_trip_start()', 'public.gps_planned_start(text)', 'public.gps_tour_days(uuid)']) f,
             unnest(array['anon', 'authenticated']) r
            where has_function_privilege(r, f, 'execute')), null,
  'rights: no app (signed in or not) can run any of the new functions - not the watch, not the tidy job, not the trip or clock checks');
select is((select string_agg(t || ':' || r || ':' || p, ' ' order by t, r, p) from
             unnest(array['public.gps_device_clock', 'public.gps_admin_access', 'public.gps_skip_counts', 'public.gps_trip_start']) t,
             unnest(array['anon', 'authenticated']) r,
             unnest(array['select', 'insert', 'update', 'delete']) p
            where has_table_privilege(r, t, p)), 'public.gps_admin_access:authenticated:select',
  'rights: the phone clocks and trip starts are the server''s alone; of the admin log, signed-in people may only read (and the rules let only admins)');
select ok(has_function_privilege('service_role', 'public.watch_trip_gps(timestamptz)', 'execute')
          and has_function_privilege('service_role', 'public.gps_tidy_pins(timestamptz)', 'execute'),
  'rights: the server runs the watch and the tidy job');

select * from finish();
rollback;
