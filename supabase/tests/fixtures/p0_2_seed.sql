-- Fake company, drivers and bookings for the P0-2 tests (no real data).
-- Included by the test files; runs as the database owner inside the test's
-- transaction, which is rolled back at the end. Times are relative to now(),
-- which is fixed for the whole transaction: calling run_booking_reminders()
-- again is "the next cron minute" inside the same reminder window, and
-- tests.advance(n) moves every stored time n minutes into the past to
-- simulate n minutes going by.
--
-- Each scenario has its own vehicle class, so one scenario's replacement
-- search can never pick another scenario's driver:
--   R45  comfort   A accepted, pickup in 45 min, unconfirmed   candidates B, C
--   RESC business  G accepted, pickup in 140 min, 3h ask 41 min ago   candidate H
--   RIP  vip       D in_progress, pickup in 45 min, unconfirmed   candidate J
--   RNONE premium  F accepted, pickup in 45 min, unconfirmed   no candidate
--   RNOESC premium F2 accepted, pickup in 140 min, 3h ask 41 min ago   no candidate
--   RDONE / RCANC economy  E, completed / cancelled, pickup in 45 min   candidate K

create schema if not exists tests;
grant usage on schema tests to public;

create or replace function tests.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.act_as_owner() returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function tests.r_id(p_name text) returns uuid
language sql immutable as $$
  select case p_name
    when 'company' then '22222222-2222-4222-8222-222222222222'
    when 'R45'    then '00000000-0000-4000-9000-000000000045'
    when 'RESC'   then '00000000-0000-4000-9000-000000000140'
    when 'RIP'    then '00000000-0000-4000-9000-0000000000a0'
    when 'RNONE'  then '00000000-0000-4000-9000-0000000000b0'
    when 'RNOESC' then '00000000-0000-4000-9000-0000000000b1'
    when 'RDONE'  then '00000000-0000-4000-9000-0000000000c0'
    when 'RCANC'  then '00000000-0000-4000-9000-0000000000c1'
    else ('00000000-0000-4000-a000-0000000000' || lpad(to_hex(ascii(p_name)), 2, '0'))
  end::uuid
$$;  -- drivers: tests.r_id('A') … tests.r_id('K'); their vehicle: tests.v_id('A')

create or replace function tests.v_id(p_driver text) returns uuid
language sql immutable as $$
  select ('00000000-0000-4000-b000-0000000000' || lpad(to_hex(ascii(p_driver)), 2, '0'))::uuid
$$;

-- n minutes go by: every stored time moves n minutes into the past.
create or replace function tests.advance(p_minutes int) returns void
language plpgsql as $$
declare
  d interval := make_interval(mins => p_minutes);
begin
  update public.bookings
     set date_display = (date_display::timestamptz - d)::text,
         reminder_3h_sent_at = reminder_3h_sent_at - d,
         reminder_1h_sent_at = reminder_1h_sent_at - d,
         reminder_45m_sent_at = reminder_45m_sent_at - d,
         driver_confirmed_at = driver_confirmed_at - d
   where company_id = tests.r_id('company');
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'bookings' and column_name = 'auto_reassigned_at') then
    execute 'update public.bookings set auto_reassigned_at = auto_reassigned_at - $1 where company_id = $2'
      using d, tests.r_id('company');
  end if;
  update public.driver_schedules s
     set start_time = s.start_time - d, end_time = s.end_time - d
   where s.booking_id in (select id from public.bookings where company_id = tests.r_id('company'));
end;
$$;

-- How many notifications of a kind a person got about a booking.
create or replace function tests.notes(p_user uuid, p_type text, p_booking uuid) returns int
language sql as $$
  select count(*)::int from public.notifications
   where user_id = p_user and type = p_type and data ->> 'bookingId' = p_booking::text
$$;

grant execute on all functions in schema tests to public;

-- people
insert into auth.users (id, email)
select tests.r_id(x), 'p02-' || lower(x) || '@test.invalid'
  from unnest(array['company','A','B','C','D','E','F','G','H','J','K','2']) x;

insert into public.users (id, role, full_name, email, is_verified, verification_status, is_available)
select tests.r_id(x),
       case when x = 'company' then 'company' else 'driver' end,
       case when x = 'company' then 'Test Transfers' when x = '2' then 'Driver F2' else 'Driver ' || x end,
       'p02-' || lower(x) || '@test.invalid', true, 'approved', true
  from unnest(array['company','A','B','C','D','E','F','G','H','J','K','2']) x;

insert into public.profiles (id, full_name, is_verified)
select tests.r_id(x), 'Test ' || x, true
  from unnest(array['company','A','B','C','D','E','F','G','H','J','K','2']) x;

-- one active, approved sedan per driver; the class decides the scenario
insert into public.vehicles (id, driver_id, type, class, plate, is_active, is_verified, verification_status)
select tests.v_id(d), tests.r_id(d), 'sedan', c, 'TEST-' || d, true, true, 'approved'
  from (values ('A','comfort'), ('B','comfort'), ('C','comfort'),
               ('G','business'), ('H','business'),
               ('D','vip'), ('J','vip'),
               ('F','premium'), ('2','premium'),
               ('E','economy'), ('K','economy')) v(d, c);

-- bookings, created pending and accepted through the real accept function
-- (so each has its calendar block), then put in the state the scenario needs
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location,
                             passenger_name, price_gel, vehicle_type, vehicle_class)
values
  (tests.r_id('R45'),    tests.r_id('company'), 'transfer', 'pending', (now() + interval '45 minutes')::text,  'Test airport', 'Test hotel', 'Test Passenger', 100, 'sedan', 'comfort'),
  (tests.r_id('RESC'),   tests.r_id('company'), 'transfer', 'pending', (now() + interval '140 minutes')::text, 'Test airport', 'Test hotel', 'Test Passenger', 100, 'sedan', 'business'),
  (tests.r_id('RIP'),    tests.r_id('company'), 'transfer', 'pending', (now() + interval '45 minutes')::text,  'Test airport', 'Test hotel', 'Test Passenger', 100, 'sedan', 'vip'),
  (tests.r_id('RNONE'),  tests.r_id('company'), 'transfer', 'pending', (now() + interval '45 minutes')::text,  'Test airport', 'Test hotel', 'Test Passenger', 100, 'sedan', 'premium'),
  (tests.r_id('RNOESC'), tests.r_id('company'), 'transfer', 'pending', (now() + interval '300 minutes')::text, 'Test airport', 'Test hotel', 'Test Passenger', 100, 'sedan', 'premium'),
  (tests.r_id('RDONE'),  tests.r_id('company'), 'transfer', 'pending', (now() + interval '45 minutes')::text,  'Test airport', 'Test hotel', 'Test Passenger', 100, 'sedan', 'economy'),
  (tests.r_id('RCANC'),  tests.r_id('company'), 'transfer', 'pending', (now() + interval '200 minutes')::text, 'Test airport', 'Test hotel', 'Test Passenger', 100, 'sedan', 'economy');

-- accepted on the company's behalf (accept_booking_atomic allows the company)
select tests.act_as(tests.r_id('company'));
select public.accept_booking_atomic(b, d, v) ->> 'code'
  from (values (tests.r_id('R45'),    tests.r_id('A'), tests.v_id('A')),
               (tests.r_id('RESC'),   tests.r_id('G'), tests.v_id('G')),
               (tests.r_id('RIP'),    tests.r_id('D'), tests.v_id('D')),
               (tests.r_id('RNONE'),  tests.r_id('F'), tests.v_id('F')),
               (tests.r_id('RNOESC'), tests.r_id('2'), tests.v_id('2')),
               (tests.r_id('RDONE'),  tests.r_id('E'), tests.v_id('E')),
               (tests.r_id('RCANC'),  tests.r_id('E'), tests.v_id('E'))) x(b, d, v);
select tests.act_as_owner();

do $$
begin
  if exists (select 1 from public.bookings where company_id = tests.r_id('company') and driver_id is null) then
    raise exception 'P0-2 seed: a booking could not be accepted';
  end if;
end
$$;

-- RNOESC really starts in 140 min; it was accepted at 300 min only so that its
-- calendar block does not collide with RNONE for driver F2 — now move it.
update public.bookings set date_display = (now() + interval '140 minutes')::text where id = tests.r_id('RNOESC');
update public.driver_schedules
   set start_time = now() + interval '140 minutes', end_time = now() + interval '260 minutes'
 where booking_id = tests.r_id('RNOESC');

-- the reminder ladder so far: 3h ask answered by nobody, 1h ask sent
update public.bookings
   set reminder_3h_sent = true, reminder_3h_sent_at = now() - interval '150 minutes',
       reminder_1h_sent = true, reminder_1h_sent_at = now() - interval '20 minutes'
 where id in (tests.r_id('R45'), tests.r_id('RIP'), tests.r_id('RNONE'), tests.r_id('RDONE'), tests.r_id('RCANC'));

update public.bookings
   set reminder_3h_sent = true, reminder_3h_sent_at = now() - interval '41 minutes'
 where id in (tests.r_id('RESC'), tests.r_id('RNOESC'));

update public.bookings set status = 'in_progress' where id = tests.r_id('RIP');
update public.bookings set status = 'completed' where id = tests.r_id('RDONE');
update public.bookings set status = 'cancelled' where id = tests.r_id('RCANC');
-- RCANC was accepted at 200 min only to avoid RDONE's calendar block; once
-- cancelled it has none, so it can sit in the same 45-minute window.
update public.bookings set date_display = (now() + interval '45 minutes')::text where id = tests.r_id('RCANC');
