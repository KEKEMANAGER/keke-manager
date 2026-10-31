-- Fake company, drivers and bookings for the P0-1 tests (no real data).
-- Included by the test files; runs as the database owner inside the test's
-- transaction, which is rolled back at the end.
--
--   company  11111111-…   drivers A aaaaaaaa-…, B bbbbbbbb-…, C cccccccc-…
--   O1, O2, O3, O5   open jobs (no driver), offered to every driver
--   T1 / T2      jobs offered to driver A / driver B alone
--   X            B's existing job, 5 Dec 10:00–12:00
--   O4           open job 5 Dec 11:00 (overlaps X)

create schema if not exists tests;
grant usage on schema tests to public;

-- Act as a signed-in user, the way PostgREST does it: role + JWT claims.
create or replace function tests.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Act as an anonymous visitor.
create or replace function tests.act_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
end;
$$;

-- Back to the database owner (sees everything, for checks).
create or replace function tests.act_as_owner() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- Direct table writes as the current user (RLS applies); return rows changed.
create or replace function tests.try_set_status(p_booking uuid, p_status text) returns int
language plpgsql as $$
declare n int;
begin
  update public.bookings set status = p_status where id = p_booking;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function tests.try_direct_accept(p_booking uuid, p_driver uuid) returns int
language plpgsql as $$
declare n int;
begin
  update public.bookings set driver_id = p_driver, status = 'accepted'
   where id = p_booking and status = 'pending';
  get diagnostics n = row_count;
  return n;
end;
$$;


-- Short names for the fake ids, so the tests read like the scenarios.
create or replace function tests.id(p_name text) returns uuid
language sql immutable as $$
  select case p_name
    when 'company' then '11111111-1111-4111-8111-111111111111'
    when 'A'  then 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    when 'B'  then 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    when 'C'  then 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    when 'vA' then 'aaaaaaaa-0000-4000-8000-00000000000a'
    when 'vB' then 'bbbbbbbb-0000-4000-8000-00000000000b'
    when 'vC' then 'cccccccc-0000-4000-8000-00000000000c'
    when 'O1' then '00000000-0000-4000-8000-0000000000a1'
    when 'O2' then '00000000-0000-4000-8000-0000000000a2'
    when 'O3' then '00000000-0000-4000-8000-0000000000a3'
    when 'O4' then '00000000-0000-4000-8000-0000000000a4'
    when 'O5' then '00000000-0000-4000-8000-0000000000a5'
    when 'T1' then '00000000-0000-4000-8000-0000000000b1'
    when 'T2' then '00000000-0000-4000-8000-0000000000b2'
    when 'X'  then '00000000-0000-4000-8000-0000000000c1'
  end::uuid
$$;

grant execute on all functions in schema tests to public;

insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'company@test.invalid'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'driver-a@test.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'driver-b@test.invalid'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'driver-c@test.invalid');

insert into public.users (id, role, full_name, email, is_verified, verification_status) values
  ('11111111-1111-4111-8111-111111111111', 'company', 'Test Tours', 'company@test.invalid', true, 'approved'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'driver', 'Driver A', 'driver-a@test.invalid', true, 'approved'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'driver', 'Driver B', 'driver-b@test.invalid', true, 'approved'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'driver', 'Driver C', 'driver-c@test.invalid', true, 'approved');

insert into public.profiles (id, full_name, is_verified) values
  ('11111111-1111-4111-8111-111111111111', 'Test Tours', true),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Driver A', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Driver B', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Driver C', true);

insert into public.vehicles (id, driver_id, type, class, plate, is_active, is_verified, verification_status) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sedan', 'comfort', 'TEST-A', true, true, 'approved'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'sedan', 'comfort', 'TEST-B', true, true, 'approved'),
  ('cccccccc-0000-4000-8000-00000000000c', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'sedan', 'comfort', 'TEST-C', true, true, 'approved');

insert into public.bookings
  (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
   passenger_name, passenger_phone, meet_phone, price_gel, vehicle_type, vehicle_class)
values
  ('00000000-0000-4000-8000-0000000000a1', '11111111-1111-4111-8111-111111111111', null, 'transfer', 'pending', '2026-12-01 10:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort'),
  ('00000000-0000-4000-8000-0000000000a2', '11111111-1111-4111-8111-111111111111', null, 'transfer', 'pending', '2026-12-02 10:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort'),
  ('00000000-0000-4000-8000-0000000000a3', '11111111-1111-4111-8111-111111111111', null, 'transfer', 'pending', '2026-12-06 10:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort'),
  ('00000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'transfer', 'pending', '2026-12-03 10:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort'),
  ('00000000-0000-4000-8000-0000000000b2', '11111111-1111-4111-8111-111111111111', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'transfer', 'pending', '2026-12-04 10:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort'),
  ('00000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111', null, 'transfer', 'pending', '2026-12-05 10:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort'),
  ('00000000-0000-4000-8000-0000000000a4', '11111111-1111-4111-8111-111111111111', null, 'transfer', 'pending', '2026-12-05 11:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort'),
  ('00000000-0000-4000-8000-0000000000a5', '11111111-1111-4111-8111-111111111111', null, 'transfer', 'pending', '2026-12-07 10:00:00+04', 'Test airport', 'Test hotel', 'Test Passenger', '+000 000 0001', '+000 000 0002', 100, 'sedan', 'comfort');
