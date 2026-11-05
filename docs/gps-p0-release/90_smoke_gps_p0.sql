-- KEKE GPS P0 - smoke test with throwaway accounts, after 10, 20 and 30.
--
-- A company, a driver and an admin that exist only inside this transaction; a
-- trip in progress, then completed. Every write is made the way the apps make
-- it (role "authenticated" + its JWT claims, as PostgREST does) and every read
-- is what that person would see on a map.
--
-- Everything happens inside ONE transaction that is ROLLED BACK at the end: no
-- account, booking, position or road point survives, and nothing is sent
-- (pg_net sends only what is committed). No real row is read or changed. The
-- result rows are the only output: every "ok" must be true.
begin;

create temp table _smoke (n serial, check_name text, ok boolean);
grant all on _smoke to authenticated;
grant usage, select on sequence _smoke_n_seq to authenticated;

do $smoke$
declare
  c uuid := gen_random_uuid();   -- company
  d uuid := gen_random_uuid();   -- driver
  a uuid := gen_random_uuid();   -- admin
  b uuid := gen_random_uuid();   -- booking
  n int;
  v text;
begin
  insert into auth.users (id, email) values (c, 'gps-smoke-company@kekemanager.com'), (d, 'gps-smoke-driver@kekemanager.com'),
                                            (a, 'gps-smoke-admin@kekemanager.com');
  insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_available)
  values (c, 'company', 'GPS smoke company', 'GPS smoke tours', 'gps-smoke-company@kekemanager.com', true, 'approved', true),
         (d, 'driver', 'GPS smoke driver', null, 'gps-smoke-driver@kekemanager.com', true, 'approved', true),
         (a, 'admin', 'GPS smoke admin', null, 'gps-smoke-admin@kekemanager.com', true, 'approved', true)
  on conflict (id) do update set role = excluded.role, full_name = excluded.full_name, company_name = excluded.company_name,
    email = excluded.email, is_verified = excluded.is_verified, verification_status = excluded.verification_status,
    is_available = excluded.is_available;
  insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                               price_gel, vehicle_type, vehicle_class, passengers, voucher_code)
  values (b, c, d, 'transfer', 'in_progress', (now() - interval '30 minutes')::text, 'GPS smoke A', 'GPS smoke B',
          100, 'sedan', 'comfort', 1, 'GPS-SMOKE-1');

  -- the driver's phone during the trip: a position (its clock 0.4 s behind) and a road point
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.driver_locations as dl (driver_id, latitude, longitude, updated_at, gps_mode, gps_mode_at)
  values (d, 41.70, 44.80, now() - interval '0.4 seconds', 'background', now() - interval '0.4 seconds')
  on conflict (driver_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
    updated_at = excluded.updated_at, gps_mode = excluded.gps_mode, gps_mode_at = excluded.gps_mode_at;
  get diagnostics n = row_count;
  insert into _smoke (check_name, ok) values ('during the trip: the phone''s position is stored', n = 1);
  insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude, created_at)
  values (d, b, now() - interval '1 minute', 41.70, 44.80, now() - interval '9 days')
  on conflict (driver_id, recorded_at) do nothing;
  get diagnostics n = row_count;
  insert into _smoke (check_name, ok) values ('during the trip: a road point is stored', n = 1);
  insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
  values (d, b, now() - interval '1 hour', 41.69, 44.79)
  on conflict (driver_id, recorded_at) do nothing;
  get diagnostics n = row_count;
  insert into _smoke (check_name, ok) values ('during the trip: a point the phone dates before the trip started is skipped', n = 0);
  execute 'reset role';
  insert into _smoke (check_name, ok)
  values ('the position carries the server''s time', (select updated_at = now() from public.driver_locations where driver_id = d)),
         ('the road point carries the server''s arrival time, not the app''s',
          (select created_at = now() from public.driver_location_trail where driver_id = d)),
         ('the phone''s clock was measured: right',
          (select abs(extract(epoch from skew)) < 120 from public.gps_device_clock where driver_id = d)),
         ('the road point says it came in during the trip',
          (select trip_check = 'trip' from public.driver_location_trail where driver_id = d)),
         ('the server noted when the trip started', (select started_at = now() from public.gps_trip_start where booking_id = b));

  -- the company and the admin during the trip
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('during the trip: the company sees the driver', exists (select 1 from public.driver_locations where driver_id = d));
  insert into _smoke (check_name, ok) values ('during the trip: the company reads the road', exists (select 1 from public.driver_location_trail where booking_id = b));
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('during the trip: the admin sees the driver', exists (select 1 from public.driver_locations where driver_id = d));
  execute 'reset role';

  -- the trip and its phone's reports have run for half an hour (inside one
  -- transaction now() stands still, so that is noted here, on throwaway rows)
  update public.gps_trip_start set started_at = now() - interval '30 minutes' where booking_id = b;
  update public.gps_device_clock set ok_since = now() - interval '30 minutes' where driver_id = d;

  -- the trip ends (as KEKE would end it)
  update public.bookings set status = 'completed' where id = b;
  insert into _smoke (check_name, ok) values ('the trip is completed, now', (select status = 'completed' and completed_at = now() from public.bookings where id = b));

  -- the driver's phone after the trip
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into public.driver_locations as dl (driver_id, latitude, longitude, updated_at, gps_mode, gps_mode_at)
  values (d, 41.90, 44.90, now(), 'background', now() - interval '0.3 seconds')
  on conflict (driver_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
    updated_at = excluded.updated_at, gps_mode = excluded.gps_mode, gps_mode_at = excluded.gps_mode_at;
  get diagnostics n = row_count;
  insert into _smoke (check_name, ok) values ('after the trip: the trip task''s report is skipped quietly (no error)', n = 0);
  insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
  values (d, b, now() + interval '10 minutes', 41.90, 44.90) on conflict (driver_id, recorded_at) do nothing;
  get diagnostics n = row_count;
  insert into _smoke (check_name, ok) values ('after the trip: a point from after the end is skipped', n = 0);
  insert into public.driver_location_trail (driver_id, booking_id, recorded_at, latitude, longitude)
  values (d, b, now() - interval '30 seconds', 41.71, 44.81) on conflict (driver_id, recorded_at) do nothing;
  get diagnostics n = row_count;
  insert into _smoke (check_name, ok) values ('after the trip: a point from before the end, sent late (clock checked), is stored', n = 1);
  insert into _smoke (check_name, ok) values ('the driver still sees himself', exists (select 1 from public.driver_locations where driver_id = d));
  execute 'reset role';
  insert into _smoke (check_name, ok)
  values ('what was skipped is counted for the day',
          (select coalesce(sum(sc.n), 0) >= 2 from public.gps_skip_counts sc where sc.day = (now() at time zone 'Asia/Tbilisi')::date));

  -- the company and the admin after the trip
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('after the trip: the company no longer sees the driver', not exists (select 1 from public.driver_locations where driver_id = d));
  select count(*)::text into v from public.driver_location_trail where booking_id = b;
  insert into _smoke (check_name, ok) values ('after the trip: the company still reads the trip''s road (2 points)', v = '2');
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into _smoke (check_name, ok) values ('after the trip: the admin no longer sees the driver', not exists (select 1 from public.driver_locations where driver_id = d));
  perform public.gps_admin_open_access(d, 'GPS smoke test of the admin exception', 5);
  insert into _smoke (check_name, ok) values ('the admin exception: opened with a reason, the admin sees the driver', exists (select 1 from public.driver_locations where driver_id = d));
  perform public.gps_admin_close_access(d);
  insert into _smoke (check_name, ok) values ('the admin exception: closed, the admin no longer sees him', not exists (select 1 from public.driver_locations where driver_id = d));
  execute 'reset role';
end
$smoke$;

select n, check_name, ok from _smoke order by n;
select case when bool_and(ok) and count(*) = 22 then 'ALL SMOKE CHECKS PASSED' else 'SMOKE FAILED - see the rows above' end as result
  from _smoke;
rollback;
