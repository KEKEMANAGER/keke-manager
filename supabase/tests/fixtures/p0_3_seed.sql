-- Fake accounts and bookings for the P0-3 tests (no real data). Included by
-- the test files; runs as the database owner inside the test's transaction,
-- which is rolled back at the end. Ids are tests.p3('<name>').
--
-- Accounts (one of each kind P0-3 is about):
--   C1   company                         ADM  admin
--   E1 E2 E3  approved drivers, approved active sedan (may take jobs)
--   NV   approved driver, no car          PV  approved, car waiting for review
--   IV   approved, approved car switched off
--   U    not approved yet (pending)       R   rejected (his old car is approved)
--   BL   blocked (approved, approved car)
--   H    fleet owner, approved; S his driver (approved, no own car, drives
--        H's approved minivan vH2 through an accepted fleet link)
--   replacement scenarios (minivans, so no sedan driver can be picked):
--     REPD  comfort  accepted by EA1; ED1 declined it while it was open
--     REPV  business accepted by EA2; PVA's car is switched on but not approved
--     REPOK vip      accepted by EA3; ED3 declined it; EB3 may take it
-- Bookings (sedan comfort, all carrying passenger details, contacts, sign,
-- notes, client price, voucher, map links, flight):
--   P1..P7 open jobs   TE offered to E1   TU offered to U
--   AE2 accepted by E2 (+20 days)          OV open, overlaps AE2
-- Plus a change-log row for TE, TU and AE2, and a pickup-sign file for P1,
-- AE2 and TE.

create schema if not exists tests;
grant usage on schema tests to public;

-- Act as a signed-in user, the way PostgREST does it.
create or replace function tests.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  -- PostgREST: signed in as authenticator, switched to the caller's role
  execute 'set local session authorization authenticator';
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.act_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local session authorization authenticator';
  execute 'set local role anon';
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

create or replace function tests.p3(p_name text) returns uuid
language sql immutable as $$
  select case p_name
    when 'C1' then '33333333-3333-4333-8333-333333333333'
    else md5('keke-p0-3-test:' || p_name)::uuid
  end
$$;

-- Run one statement as the current user; rows changed, or -1 when it is
-- refused for lack of rights (42501). Other errors: -2 (and a notice).
create or replace function tests.try_sql(p_sql text) returns int
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception
  when insufficient_privilege then
    return -1;
  when others then
    raise notice 'try_sql: % %', sqlstate, sqlerrm;
    return -2;
end;
$$;

-- What the app's open-jobs list gets: from the server summary, and the way the
-- app versions before P0-3 read it (straight from the table).
create or replace function tests.rpc_open_ids() returns uuid[]
language plpgsql as $$
declare ids uuid[];
begin
  if to_regprocedure('public.driver_open_jobs(uuid)') is null then
    return null;  -- not deployed (before P0-3)
  end if;
  execute $q$
    select coalesce(array_agg((e ->> 'id')::uuid order by e ->> 'id'), '{}')
      from jsonb_array_elements(public.driver_open_jobs()) e $q$ into ids;
  return ids;
end;
$$;

create or replace function tests.table_open_ids() returns uuid[]
language sql as $$
  select coalesce(array_agg(b.id order by b.id::text), '{}')
    from public.bookings b
   where b.status = 'pending'
     and b.is_group_master = false
     and (b.driver_id is null or b.driver_id = auth.uid())
$$;

-- Is part B (summary only before the job is yours) applied?
create or replace function tests.part_b() returns boolean
language sql as $$
  select exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'bookings'
       and policyname = 'bookings_select_participants'
       and qual not like '%current_driver_can_take_jobs%'
       and qual not like '%role = %'
  ) and to_regprocedure('public.driver_open_jobs(uuid)') is not null
$$;

grant execute on all functions in schema tests to public;

-- people ---------------------------------------------------------------------
insert into auth.users (id, email)
select tests.p3(x), 'p03-' || lower(x) || '@test.invalid'
  from unnest(array['C1','ADM','E1','E2','E3','NV','PV','IV','U','R','BL','H','S',
                    'EA1','ED1','EA2','PVA','EA3','ED3','EB3']) x;

insert into public.users (id, role, full_name, email, is_verified, verification_status, is_blocked, is_available)
select tests.p3(x),
       case x when 'C1' then 'company' when 'ADM' then 'admin' else 'driver' end,
       case x when 'C1' then 'Test Tours P3' else 'Test ' || x end,
       'p03-' || lower(x) || '@test.invalid',
       x not in ('U', 'R'),
       case x when 'U' then 'pending' when 'R' then 'rejected' else 'approved' end,
       x = 'BL',
       true
  from unnest(array['C1','ADM','E1','E2','E3','NV','PV','IV','U','R','BL','H','S',
                    'EA1','ED1','EA2','PVA','EA3','ED3','EB3']) x;

insert into public.profiles (id, full_name, is_verified)
select tests.p3(x), 'Test ' || x, x not in ('U', 'R')
  from unnest(array['C1','ADM','E1','E2','E3','NV','PV','IV','U','R','BL','H','S',
                    'EA1','ED1','EA2','PVA','EA3','ED3','EB3']) x;

-- cars: (car, owner, type, class, status, active)
insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
select tests.p3(v), tests.p3(d), t, c, 'Test model', 'TEST-' || v, s, s = 'approved', a
  from (values
    ('vE1',  'E1',  'sedan',   'comfort',  'approved', true),
    ('vE2',  'E2',  'sedan',   'comfort',  'approved', true),
    ('vE3',  'E3',  'sedan',   'comfort',  'approved', true),
    ('vPV',  'PV',  'sedan',   'comfort',  'pending',  false),
    ('vIV',  'IV',  'sedan',   'comfort',  'approved', false),
    ('vU',   'U',   'sedan',   'comfort',  'pending',  false),
    ('vR',   'R',   'sedan',   'comfort',  'approved', true),
    ('vBL',  'BL',  'sedan',   'comfort',  'approved', true),
    ('vH',   'H',   'sedan',   'comfort',  'approved', true),
    ('vH2',  'H',   'minivan', 'comfort',  'approved', false),
    ('vEA1', 'EA1', 'minivan', 'comfort',  'approved', true),
    ('vED1', 'ED1', 'minivan', 'comfort',  'approved', true),
    ('vEA2', 'EA2', 'minivan', 'business', 'approved', true),
    ('vPVA', 'PVA', 'minivan', 'business', 'pending',  true),
    ('vEA3', 'EA3', 'minivan', 'vip',      'approved', true),
    ('vED3', 'ED3', 'minivan', 'vip',      'approved', true),
    ('vEB3', 'EB3', 'minivan', 'vip',      'approved', true)
  ) as x(v, d, t, c, s, a);
-- vehicles_activate_on_approval switched IV's only car on: switch it off again
update public.vehicles set is_active = false where id = tests.p3('vIV');

insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
values (tests.p3('H'), tests.p3('S'), tests.p3('vH2'), 'accepted');

-- bookings -------------------------------------------------------------------
insert into public.bookings (id, company_id, driver_id, kind, status, date_display,
                             from_location, to_location, price_gel, vehicle_type, vehicle_class, passengers, luggage)
select tests.p3(b), tests.p3('C1'), case when d is null then null else tests.p3(d) end,
       'transfer', 'pending', (now() + make_interval(mins => m))::text,
       'Test airport', 'Test hotel', 150, t, c, 3, 2
  from (values
    ('P1',  null,  14400, 'sedan', 'comfort'),
    ('P2',  null,  15840, 'sedan', 'comfort'),
    ('P3',  null,  17280, 'sedan', 'comfort'),
    ('P4',  null,  18720, 'sedan', 'comfort'),
    ('P5',  null,  20160, 'sedan', 'comfort'),
    ('P6',  null,  21600, 'sedan', 'comfort'),
    ('P7',  null,  23040, 'sedan', 'comfort'),
    ('TE',  'E1',  24480, 'sedan', 'comfort'),
    ('TU',  'U',   25920, 'sedan', 'comfort'),
    ('AE2', null,  28800, 'sedan', 'comfort'),
    ('OV',  null,  28860, 'sedan', 'comfort'),
    ('REPD',  null, 45, 'minivan', 'comfort'),
    ('REPV',  null, 45, 'minivan', 'business'),
    ('REPOK', null, 45, 'minivan', 'vip')
  ) as x(b, d, m, t, c);

-- the private parts every booking carries
update public.bookings
   set passenger_name = 'Test Passenger',
       passenger_phone = '+000 000 0003',
       meet_name = 'Test Meet',
       meet_phone = '+000 000 0004',
       sign_text = 'TEST SIGN',
       comment = 'Test note, call +000 000 0005',
       flight_number = 'TS123',
       client_price = 999,
       commission = 99,
       price_net = 800,
       price_gross = 900,
       voucher_code = 'TEST-V',
       created_by_name = 'Test Staff',
       pickup_sign_logo_url = 'https://example.invalid/sign.png',
       from_location_link = 'https://maps.example.invalid/from',
       to_location_link = 'https://maps.example.invalid/to',
       payment_method = 'cash',
       route = to_jsonb('Test airport → Test hotel'::text),
       transfer_in = jsonb_build_object('date', '2026-12-10', 'airport', 'Test airport', 'airport_type', 'airport',
                                        'hotel', 'Test hotel', 'hotel_type', 'hotel', 'flight', 'TS123',
                                        'passengerName', 'Test Passenger', 'hotel_link', 'https://maps.example.invalid/h'),
       tour_days = jsonb_build_array(jsonb_build_object('day', 1, 'date', '2026-12-10', 'fromPlace', 'Test city',
                                        'toPlace', 'Test town', 'stops', 'Test stop', 'touristHotel', 'Test hotel',
                                        'touristHotelLink', 'https://maps.example.invalid/t', 'driverOvernight', 'Test inn')),
       itinerary = jsonb_build_array(jsonb_build_object('day', 1, 'from', 'Test city', 'to', 'Test town', 'stops', 'Test stop'))
 where company_id = tests.p3('C1');

-- declines while the jobs were open, then the company gives each job to its driver
select tests.act_as(tests.p3('ED1'));
select public.reject_pending_booking_as_driver(tests.p3('REPD'));
select tests.act_as(tests.p3('ED3'));
select public.reject_pending_booking_as_driver(tests.p3('REPOK'));
select tests.act_as(tests.p3('C1'));
select public.accept_booking_atomic(tests.p3('AE2'), tests.p3('E2'), tests.p3('vE2'));
select public.accept_booking_atomic(tests.p3('REPD'), tests.p3('EA1'), tests.p3('vEA1'));
select public.accept_booking_atomic(tests.p3('REPV'), tests.p3('EA2'), tests.p3('vEA2'));
select public.accept_booking_atomic(tests.p3('REPOK'), tests.p3('EA3'), tests.p3('vEA3'));
select tests.act_as_owner();

-- the company's change log and pickup-sign files
insert into public.booking_history (booking_id, changed_by, changes, reason)
select tests.p3(b), tests.p3('C1'),
       jsonb_build_object('passenger_phone', jsonb_build_object('old', '+000 000 0009', 'new', '+000 000 0003')),
       'test'
  from unnest(array['TE', 'TU', 'AE2']) b;

insert into storage.objects (bucket_id, name, owner)
select 'booking-pickup-signs', tests.p3('C1')::text || '/' || tests.p3(b)::text || '/1.png', tests.p3('C1')
  from unnest(array['P1', 'AE2', 'TE']) b;
