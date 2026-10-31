-- Fake accounts, phones and bookings for the P0-4 tests (no real data, no real
-- tokens: every token is "ExponentPushToken[p04-<name>]", and net.http_post is
-- the shim's recorder, so nothing leaves the machine). Included by the test
-- files; runs as the database owner inside the test's transaction, which is
-- rolled back at the end. Ids are tests.p4('<name>').
--
-- Accounts:
--   C1 C2  companies                      ADM  admin
--   E1 E2 E3  approved drivers, approved active sedan (may take jobs)
--   BL   blocked (approved, approved car)
--   PO   KEKE has not approved him (users), only profiles.is_verified is set;
--        approved car — the server's old dispatch counted him as verified
--   U    new sign-up, not approved, no car (the "any signed-in account")
--   H    fleet owner (approved; approved minivans vH2, vH3, switched off for himself)
--   S    H's driver (approved, no own car, drives vH2 through an accepted link)
--   X    driver H has invited to drive vH3 (link pending)
--   HD   hired driver looking for work (job board)
-- Bookings (C1's unless said otherwise):
--   OPEN1 OPEN2 OPEN3  open sedan/comfort jobs; E3 declined OPEN1
--   ACC1  accepted by E1 (start odometer photo uploaded, a change logged)
--   ASG1  offered to E2 alone (pending, driver set), voucher V-ASG1
--   EMR1  offered to E2 as an urgent replacement (pending, driver set)
--   CAN1  E2 accepted it, then cancelled it
--   FLT1  H took it for S (accepted by S, host H, payout 120)
--   FLT2  done by S for H (completed, host H)
--   C2OPEN  C2's open job
-- Plus: a chat message C1 → E1 about ACC1, a support message E2 → ADM, and
-- H's pending fleet invitation to X.

create schema if not exists tests;
grant usage on schema tests to public;

-- Act as a signed-in user, the way PostgREST does it.
create or replace function tests.act_as(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
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

create or replace function tests.p4(p_name text) returns uuid
language sql immutable as $$
  select md5('keke-p0-4-test:' || p_name)::uuid
$$;

create or replace function tests.tok(p_name text) returns text
language sql immutable as $$
  select 'ExponentPushToken[p04-' || p_name || ']'
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

-- The value one query returns as text, or 'denied' (42501) / 'error'.
create or replace function tests.try_value(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, 'null');
exception
  when insufficient_privilege then
    return 'denied';
  when others then
    raise notice 'try_value: % %', sqlstate, sqlerrm;
    return 'error';
end;
$$;

-- The SQLSTATE a statement fails with, or 'ok'.
create or replace function tests.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- What reached Expo (recorded by the shim's net.http_post), per phone.
create or replace function tests.pushes_to(p_token text) returns int
language sql security definer set search_path = public, net as $$
  select count(*)::int from net.http_calls c
   where c.url like 'https://exp.host/%' and c.body ->> 'to' = p_token
$$;

create or replace function tests.push_texts(p_token text) returns text
language sql security definer set search_path = public, net as $$
  select coalesce(string_agg(coalesce(c.body ->> 'title', '') || ' | ' || coalesce(c.body ->> 'body', ''), ' || ' order by c.id), '')
    from net.http_calls c
   where c.url like 'https://exp.host/%' and c.body ->> 'to' = p_token
$$;

create or replace function tests.expo_calls() returns int
language sql security definer set search_path = public, net as $$
  select count(*)::int from net.http_calls c where c.url like 'https://exp.host/%'
$$;

-- In-app notices a user has, of one type (and for one booking).
create or replace function tests.notices(p_user uuid, p_type text, p_booking uuid default null) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.notifications n
   where n.user_id = p_user and n.type = p_type
     and (p_booking is null or n.data ->> 'booking_id' = p_booking::text)
$$;

create or replace function tests.notice_bodies(p_user uuid, p_type text) returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(coalesce(n.title, '') || ' | ' || coalesce(n.body, ''), ' || ' order by n.created_at, n.id), '')
    from public.notifications n where n.user_id = p_user and n.type = p_type
$$;

-- Second-wave rows waiting for a booking (any kind of row).
create or replace function tests.outbox_rows(p_booking uuid) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.push_outbox o where o.booking_id = p_booking and o.sent_at is null
$$;

-- Make every waiting second-wave row due now, then run the cron's flush.
create or replace function tests.flush_now() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.push_outbox set send_after = now() - interval '1 second' where sent_at is null;
  select public.flush_push_outbox() into n;
  return n;
end;
$$;

-- Is P0-4 part A / part B applied?
create or replace function tests.p4_part_a() returns boolean
language sql as $$ select to_regclass('public.push_tokens') is not null $$;

create or replace function tests.p4_part_b() returns boolean
language sql as $$
  select exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.profiles'::regclass and t.tgname = 'push_tokens_capture')
$$;

grant execute on all functions in schema tests to public;

-- people ---------------------------------------------------------------------
insert into auth.users (id, email)
select tests.p4(x), 'p04-' || lower(x) || '@test.invalid'
  from unnest(array['C1','C2','ADM','E1','E2','E3','BL','PO','U','H','S','X','HD']) x;

insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status,
                          is_blocked, is_available, is_hired_driver, available_for_hire)
select tests.p4(x),
       case when x in ('C1', 'C2') then 'company' when x = 'ADM' then 'admin' else 'driver' end,
       'Test ' || x,
       case when x in ('C1', 'C2') then 'Test Tours ' || x end,
       'p04-' || lower(x) || '@test.invalid',
       x not in ('PO', 'U'),
       case x when 'PO' then 'pending' when 'U' then 'pending' else 'approved' end,
       x = 'BL',
       true,
       x = 'HD',
       true
  from unnest(array['C1','C2','ADM','E1','E2','E3','BL','PO','U','H','S','X','HD']) x;

-- Each phone registers the way every app version does: its token on the
-- profile (the profile row is created with it).
insert into public.profiles (id, full_name, is_verified, push_token)
select tests.p4(x), 'Test ' || x, x not in ('U'), tests.tok(x)
  from unnest(array['C1','C2','ADM','E1','E2','E3','BL','PO','U','H','S','X','HD']) x;

-- cars: (car, owner, type, class, status, active)
insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
select tests.p4(v), tests.p4(d), t, c, 'Test model', 'TEST-' || v, s, s = 'approved', a
  from (values
    ('vE1',  'E1',  'sedan',   'comfort', 'approved', true),
    ('vE2',  'E2',  'sedan',   'comfort', 'approved', true),
    ('vE3',  'E3',  'sedan',   'comfort', 'approved', true),
    ('vBL',  'BL',  'sedan',   'comfort', 'approved', true),
    ('vPO',  'PO',  'sedan',   'comfort', 'approved', true),
    ('vH2',  'H',   'minivan', 'comfort', 'approved', false),
    ('vH3',  'H',   'minivan', 'economy', 'approved', false),
    ('vHD',  'HD',  'sedan',   'comfort', 'approved', true),
    ('vX',   'X',   'sedan',   'economy', 'approved', true)
  ) as x(v, d, t, c, s, a);
-- vehicles_activate_on_approval may have switched H's minivan on: off again
update public.vehicles set is_active = false where id in (tests.p4('vH2'), tests.p4('vH3'));

insert into public.driver_fleet (id, host_driver_id, sub_driver_id, vehicle_id, status)
values (tests.p4('fleetS'), tests.p4('H'), tests.p4('S'), tests.p4('vH2'), 'accepted'),
       (tests.p4('fleetX'), tests.p4('H'), tests.p4('X'), tests.p4('vH3'), 'pending');

-- bookings -------------------------------------------------------------------
insert into public.bookings (id, company_id, driver_id, kind, status, date_display,
                             from_location, to_location, price_gel, vehicle_type, vehicle_class,
                             passengers, luggage, voucher_code)
select tests.p4(b), tests.p4(co), case when d is null then null else tests.p4(d) end,
       'transfer', 'pending', (now() + make_interval(mins => m))::text,
       'Test airport', 'Test hotel', 150, t, c, 3, 2, 'V-' || b
  from (values
    ('OPEN1',  'C1', null, 14400, 'sedan',   'comfort'),
    ('OPEN2',  'C1', null, 15840, 'sedan',   'comfort'),
    ('OPEN3',  'C1', null, 17280, 'sedan',   'comfort'),
    ('ACC1',   'C1', null, 18720, 'sedan',   'comfort'),
    ('ASG1',   'C1', 'E2', 20160, 'sedan',   'comfort'),
    ('EMR1',   'C1', 'E2', 21600, 'sedan',   'comfort'),
    ('CAN1',   'C1', null, 23040, 'sedan',   'comfort'),
    ('FLT1',   'C1', null, 24480, 'minivan', 'comfort'),
    ('FLT2',   'C1', null, 25920, 'minivan', 'comfort'),
    ('C2OPEN', 'C2', null, 27360, 'sedan',   'comfort')
  ) as x(b, co, d, m, t, c);

-- E3 declines OPEN1 while it is open
select tests.act_as(tests.p4('E3'));
select public.reject_pending_booking_as_driver(tests.p4('OPEN1'));
-- the jobs that are taken
select tests.act_as(tests.p4('C1'));
select public.accept_booking_atomic(tests.p4('ACC1'), tests.p4('E1'), tests.p4('vE1'));
select public.accept_booking_atomic(tests.p4('CAN1'), tests.p4('E2'), tests.p4('vE2'));
select tests.act_as(tests.p4('H'));
select public.accept_booking_atomic(tests.p4('FLT1'), tests.p4('S'), tests.p4('vH2'));
select public.accept_booking_atomic(tests.p4('FLT2'), tests.p4('S'), tests.p4('vH2'));
select tests.act_as_owner();

update public.bookings set host_driver_id = tests.p4('H'), driver_payout_gel = 120
 where id in (tests.p4('FLT1'), tests.p4('FLT2'));
update public.bookings set status = 'completed' where id = tests.p4('FLT2');
-- E2 cancels CAN1 himself (as his app does)
select tests.act_as(tests.p4('E2'));
update public.bookings set status = 'cancelled' where id = tests.p4('CAN1');
select tests.act_as_owner();
update public.bookings set is_emergency_replacement = true where id = tests.p4('EMR1');
update public.bookings set odometer_start_photo_url = 'https://example.invalid/odo-start.jpg'
 where id = tests.p4('ACC1');

-- the company's change log for ACC1 (what the edit screen writes)
insert into public.booking_history (booking_id, changed_by, changes, reason)
values (tests.p4('ACC1'), tests.p4('C1'),
        jsonb_build_object('date_display', jsonb_build_object('old', '10:00', 'new', '11:30', 'label', 'დრო')),
        'test');

-- chat
insert into public.messages (id, sender_id, receiver_id, booking_id, text, thread_type)
values (tests.p4('msg1'), tests.p4('C1'), tests.p4('E1'), tests.p4('ACC1'), 'Test message about ACC1', 'company_driver'),
       (tests.p4('msg2'), tests.p4('E2'), tests.p4('ADM'), null, 'Test support question', 'support');

-- nothing recorded so far counts
delete from public.notifications;
delete from net.http_calls;
