-- Fake accounts and bookings for the P0-5 tests (no real data; every phone
-- token is "ExponentPushToken[p05-<name>]" and net.http_post is the shim's
-- recorder, so nothing leaves the machine). Included by the test files; runs
-- as the database owner inside the test's transaction, which is rolled back.
-- Ids are tests.p5('<name>').
--
-- Accounts: C1 C2 companies, ADM admin, E1 E2 E3 approved drivers with an
-- approved sedan, H fleet owner (approved minivan vH2, off for himself) and S,
-- his driver on vH2.
-- Bookings (C1's unless said otherwise; days from now):
--   OPEN   pending, open to every driver (+10)
--   OFFER  pending, offered to E2 alone (+11)
--   ACC    accepted by E1 (+12)            ACC2  accepted by E1 (+13)
--   FLT FLT2  H gave them to S (accepted by S, host H, +14 / +21)
--   RUN    E3's trip in progress (started an hour ago)
--   DONE   completed by E1                 CNL   cancelled        REJ  declined
--   C2ACC  C2's booking, accepted by E2 (+15)
--   MST    a convoy: LEG1 accepted by E3, LEG2 open (+16)
--   MST2   a convoy with LEG3 on the road (E2) and LEG4 open

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

create or replace function tests.p5(p_name text) returns uuid
language sql immutable as $$
  select md5('keke-p0-5-test:' || p_name)::uuid
$$;

create or replace function tests.tok5(p_name text) returns text
language sql immutable as $$
  select 'ExponentPushToken[p05-' || p_name || ']'
$$;

-- rows changed, -1 refused for lack of rights (42501), -2 another error
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

create or replace function tests.sqlstate_of(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- The app's call: what cancel_booking_by_company answers (code), or the
-- SQLSTATE it fails with.
create or replace function tests.cancel(p_booking uuid) returns text
language plpgsql as $$
declare r jsonb;
begin
  if to_regprocedure('public.cancel_booking_by_company(uuid,text)') is null then
    return 'missing';
  end if;
  execute 'select public.cancel_booking_by_company($1, $2)' into r using p_booking, 'test';
  return r ->> 'code';
exception when others then
  return sqlstate;
end;
$$;

create or replace function tests.status_of(p_booking uuid) returns text
language sql security definer set search_path = public as $$
  select status from public.bookings where id = p_booking
$$;

-- Does the booking's calendar block still reserve time from now on?
create or replace function tests.blocked(p_booking uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.driver_schedules s
                  where s.booking_id = p_booking and s.source = 'booking'
                    and s.end_time > now() and s.end_time > s.start_time)
$$;

-- Is the driver free at the booking's own time (what a new job needs)?
create or replace function tests.driver_free_at(p_driver uuid, p_booking uuid) returns boolean
language sql security definer set search_path = public as $$
  select not exists (
    select 1 from public.driver_schedules s, public.booking_busy_window(p_booking) w
     where s.driver_id = p_driver
       and tstzrange(s.start_time, s.end_time, '[)') && tstzrange(w.win_start, w.win_end, '[)'))
$$;

create or replace function tests.notices(p_user uuid, p_type text, p_booking uuid default null) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.notifications n
   where n.user_id = p_user and n.type = p_type
     and (p_booking is null or n.data ->> 'booking_id' = p_booking::text)
$$;

create or replace function tests.notice_text(p_user uuid, p_type text) returns text
language sql security definer set search_path = public as $$
  select coalesce(string_agg(coalesce(n.title, '') || ' | ' || coalesce(n.body, ''), ' || ' order by n.created_at, n.id), '')
    from public.notifications n where n.user_id = p_user and n.type = p_type
$$;

create or replace function tests.pushes_to(p_token text) returns int
language sql security definer set search_path = public, net as $$
  select count(*)::int from net.http_calls c
   where c.url like 'https://exp.host/%' and c.body ->> 'to' = p_token
$$;

create or replace function tests.history_lines(p_booking uuid) returns int
language sql security definer set search_path = public as $$
  select count(*)::int from public.booking_history h
   where h.booking_id = p_booking and h.changes ? 'status'
$$;

create or replace function tests.p5_applied() returns boolean
language sql as $$ select to_regprocedure('public.cancel_booking_by_company(uuid,text)') is not null $$;

grant execute on all functions in schema tests to public;

-- people ---------------------------------------------------------------------
insert into auth.users (id, email)
select tests.p5(x), 'p05-' || lower(x) || '@test.invalid'
  from unnest(array['C1','C2','ADM','E1','E2','E3','H','S']) x;

insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_available)
select tests.p5(x),
       case when x in ('C1', 'C2') then 'company' when x = 'ADM' then 'admin' else 'driver' end,
       'Test ' || x,
       case when x in ('C1', 'C2') then 'Test Tours ' || x end,
       'p05-' || lower(x) || '@test.invalid',
       true, 'approved', true
  from unnest(array['C1','C2','ADM','E1','E2','E3','H','S']) x;

insert into public.profiles (id, full_name, is_verified, push_token)
select tests.p5(x), 'Test ' || x, true, tests.tok5(x)
  from unnest(array['C1','C2','ADM','E1','E2','E3','H','S']) x;

insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
select tests.p5(v), tests.p5(d), t, 'comfort', 'Test model', 'TEST-' || v, 'approved', true, a
  from (values ('vE1', 'E1', 'sedan', true), ('vE2', 'E2', 'sedan', true), ('vE3', 'E3', 'sedan', true),
               ('vH2', 'H', 'minivan', false)) as x(v, d, t, a);
update public.vehicles set is_active = false where id = tests.p5('vH2');
insert into public.driver_fleet (host_driver_id, sub_driver_id, vehicle_id, status)
values (tests.p5('H'), tests.p5('S'), tests.p5('vH2'), 'accepted');

-- bookings -------------------------------------------------------------------
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code, parent_booking_id,
                             is_group_master)
select tests.p5(b), tests.p5(co), case when d is null then null else tests.p5(d) end, 'transfer', st,
       (now() + make_interval(mins => m))::text, 'Test airport', 'Test hotel', 150, t, 'comfort', 2,
       'V-' || b, case when par is null then null else tests.p5(par) end, coalesce(gm, false)
  from (values
    ('OPEN',  'C1', null, 'pending',   14400, 'sedan',   null,   null),
    ('OFFER', 'C1', 'E2', 'pending',   15840, 'sedan',   null,   null),
    ('ACC',   'C1', null, 'pending',   17280, 'sedan',   null,   null),
    ('ACC2',  'C1', null, 'pending',   18720, 'sedan',   null,   null),
    ('FLT',   'C1', null, 'pending',   20160, 'minivan', null,   null),
    ('FLT2',  'C1', null, 'pending',   30240, 'minivan', null,   null),
    ('RUN',   'C1', null, 'pending',    1440, 'sedan',   null,   null),
    ('DONE',  'C1', 'E1', 'completed', -2880, 'sedan',   null,   null),
    ('CNL',   'C1', null, 'cancelled', 21600, 'sedan',   null,   null),
    ('REJ',   'C1', null, 'rejected',  23040, 'sedan',   null,   null),
    ('C2ACC', 'C2', null, 'pending',   24480, 'sedan',   null,   null),
    ('MST',   'C1', null, 'pending',   25920, 'sedan',   null,   true),
    ('MST2',  'C1', null, 'pending',   28800, 'sedan',   null,   true)
  ) as x(b, co, d, st, m, t, par, gm);
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code, parent_booking_id, leg_index)
select tests.p5(b), tests.p5('C1'), null, 'transfer', 'pending', (now() + make_interval(mins => m))::text,
       'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2, 'V-' || b, tests.p5(par), li
  from (values ('LEG1', 'MST', 25920, 1), ('LEG2', 'MST', 25920, 2),
               ('LEG3', 'MST2', 2880, 1), ('LEG4', 'MST2', 28800, 2)) as x(b, par, m, li);

-- the jobs that are taken (the company gives each to its driver; H to S)
select tests.act_as(tests.p5('C1'));
select public.accept_booking_atomic(tests.p5('ACC'),  tests.p5('E1'), tests.p5('vE1'));
select public.accept_booking_atomic(tests.p5('ACC2'), tests.p5('E1'), tests.p5('vE1'));
select public.accept_booking_atomic(tests.p5('RUN'),  tests.p5('E3'), tests.p5('vE3'));
select public.accept_booking_atomic(tests.p5('LEG1'), tests.p5('E3'), tests.p5('vE3'));
select public.accept_booking_atomic(tests.p5('LEG3'), tests.p5('E2'), tests.p5('vE2'));
select tests.act_as(tests.p5('C2'));
select public.accept_booking_atomic(tests.p5('C2ACC'), tests.p5('E2'), tests.p5('vE2'));
select tests.act_as(tests.p5('H'));
select public.accept_booking_atomic(tests.p5('FLT'), tests.p5('S'), tests.p5('vH2'));
select public.accept_booking_atomic(tests.p5('FLT2'), tests.p5('S'), tests.p5('vH2'));
select tests.act_as_owner();
update public.bookings set host_driver_id = tests.p5('H') where id in (tests.p5('FLT'), tests.p5('FLT2'));

-- RUN and LEG3 are on the road: started an hour ago
update public.bookings set status = 'in_progress' where id in (tests.p5('RUN'), tests.p5('LEG3'));
update public.driver_schedules
   set start_time = now() - interval '1 hour', end_time = now() + interval '2 hours'
 where booking_id in (tests.p5('RUN'), tests.p5('LEG3'));
update public.bookings set status = 'accepted' where id = tests.p5('MST');
update public.bookings set status = 'in_progress' where id = tests.p5('MST2');

-- nothing recorded so far counts
delete from public.booking_history;
delete from public.notifications;
delete from net.http_calls;
