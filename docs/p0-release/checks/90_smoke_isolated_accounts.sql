-- KEKE P0 release - smoke test with isolated throwaway accounts.
--
-- Run after each step (and once at the end). It creates its own company,
-- drivers, vehicles and bookings with fresh random ids, plays the apps' part
-- as those accounts (role "authenticated" + their JWT claims, as PostgREST
-- does), and checks every phase that is in place. P0-2 has no check here: its
-- worker would also scan real bookings, so it is verified by the read-only
-- check and the cron run history instead.
--
-- Everything happens inside ONE transaction that is ROLLED BACK at the end:
-- no account, booking, notification or push survives, and nothing is sent
-- (pg_net sends only what is committed; the email and push queues are rows in
-- this same transaction). The result rows are the only output.
begin;

create temp table _smoke (n serial, phase text, check_name text, ok boolean, detail text);

do $smoke$
declare
  c   uuid := gen_random_uuid();  -- company
  d1  uuid := gen_random_uuid();  -- approved driver
  d2  uuid := gen_random_uuid();  -- approved driver
  u   uuid := gen_random_uuid();  -- driver KEKE has not approved
  v1  uuid := gen_random_uuid();  v2 uuid := gen_random_uuid();  vu uuid := gen_random_uuid();
  b_open  uuid := gen_random_uuid();  -- open job, for the decline checks
  b_open2 uuid := gen_random_uuid();  -- open job, for the eligibility checks
  b_acc   uuid := gen_random_uuid();  -- accepted by d1
  b_run   uuid := gen_random_uuid();  -- trip in progress (d2)
  outsider text := 'ExponentPushToken[p0-smoke-outsider]';
  p1 boolean; p3 boolean; p4 boolean; p5 boolean;
  ok_b boolean; n int; s text; r jsonb; st text;
begin
  p1 := to_regclass('public.booking_driver_declines') is not null;
  p3 := exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                 where ns.nspname = 'public' and p.proname = 'driver_can_take_jobs');
  p4 := to_regclass('public.push_tokens') is not null;
  p5 := exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                 where ns.nspname = 'public' and p.proname = 'cancel_booking_by_company');

  -- throwaway accounts (as the database owner)
  insert into auth.users (id, email)
  values (c, 'p0-smoke-company@kekemanager.com'), (d1, 'p0-smoke-d1@kekemanager.com'),
         (d2, 'p0-smoke-d2@kekemanager.com'), (u, 'p0-smoke-unapproved@kekemanager.com');
  insert into public.users (id, role, full_name, company_name, email, is_verified, verification_status, is_available)
  values (c,  'company', 'P0 smoke company', 'P0 smoke tours', 'p0-smoke-company@kekemanager.com', true, 'approved', true),
         (d1, 'driver',  'P0 smoke D1', null, 'p0-smoke-d1@kekemanager.com', true, 'approved', true),
         (d2, 'driver',  'P0 smoke D2', null, 'p0-smoke-d2@kekemanager.com', true, 'approved', true),
         (u,  'driver',  'P0 smoke U',  null, 'p0-smoke-unapproved@kekemanager.com', false, 'pending', true)
  on conflict (id) do update
     set role = excluded.role, full_name = excluded.full_name, company_name = excluded.company_name,
         email = excluded.email, is_verified = excluded.is_verified,
         verification_status = excluded.verification_status, is_available = excluded.is_available;
  insert into public.profiles (id, full_name, is_verified)
  values (c, 'P0 smoke company', true), (d1, 'P0 smoke D1', true), (d2, 'P0 smoke D2', true), (u, 'P0 smoke U', false)
  on conflict (id) do nothing;
  insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
  values (v1, d1, 'sedan', 'comfort', 'P0 smoke', 'P0-SMOKE-1', 'approved', true, true),
         (v2, d2, 'sedan', 'comfort', 'P0 smoke', 'P0-SMOKE-2', 'approved', true, true),
         (vu, u,  'sedan', 'comfort', 'P0 smoke', 'P0-SMOKE-U', 'approved', true, true);
  insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                               price_gel, vehicle_type, vehicle_class, passengers, voucher_code)
  values (b_open,  c, null, 'transfer', 'pending',     (now() + interval '30 days')::text, 'P0 smoke A', 'P0 smoke B', 1, 'sedan', 'comfort', 1, 'P0-SMOKE-1'),
         (b_open2, c, null, 'transfer', 'pending',     (now() + interval '31 days')::text, 'P0 smoke A', 'P0 smoke B', 1, 'sedan', 'comfort', 1, 'P0-SMOKE-2'),
         (b_acc,   c, d1,   'transfer', 'accepted',    (now() + interval '32 days')::text, 'P0 smoke A', 'P0 smoke B', 1, 'sedan', 'comfort', 1, 'P0-SMOKE-3'),
         (b_run,   c, d2,   'transfer', 'in_progress', (now() - interval '1 hour')::text,  'P0 smoke A', 'P0 smoke B', 1, 'sedan', 'comfort', 1, 'P0-SMOKE-4');

  -- P0-1: a driver's decline of an open job is his alone ----------------------
  if p1 then
    perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      ok_b := public.reject_pending_booking_as_driver(b_open);
    exception when others then ok_b := null; s := sqlerrm; end;
    execute 'reset role';
    insert into _smoke (phase, check_name, ok, detail) values ('P0-1', 'the driver can decline an open job', ok_b is true, s);
    select status into st from public.bookings where id = b_open;
    insert into _smoke (phase, check_name, ok, detail) values ('P0-1', 'the job stays open for everyone else', st = 'pending', st);
    perform set_config('request.jwt.claims', json_build_object('sub', d1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.bookings where id = b_open;
    execute 'reset role';
    insert into _smoke (phase, check_name, ok, detail) values ('P0-1', 'the declining driver no longer sees it', n = 0, n::text);
    perform set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.bookings where id = b_open;
    execute 'reset role';
    insert into _smoke (phase, check_name, ok, detail) values ('P0-1', 'another approved driver still sees it', n = 1, n::text);
  end if;

  -- P0-3 part A: only drivers KEKE approved take jobs -------------------------
  if p3 then
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.bookings where id = b_open2;
    begin
      r := public.accept_booking_atomic(b_open2, u, vu);
    exception when others then r := jsonb_build_object('code', 'error: ' || sqlstate); end;
    execute 'reset role';
    insert into _smoke (phase, check_name, ok, detail) values ('P0-3 A', 'an unapproved driver does not see the open job', n = 0, n::text);
    insert into _smoke (phase, check_name, ok, detail) values ('P0-3 A', 'an unapproved driver cannot take it', coalesce(r ->> 'code', '') <> 'accepted', r ->> 'code');
    perform set_config('request.jwt.claims', json_build_object('sub', d2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      r := public.accept_booking_atomic(b_open2, d2, v2);
    exception when others then r := jsonb_build_object('code', 'error: ' || sqlstate || ' ' || sqlerrm); end;
    execute 'reset role';
    select status into st from public.bookings where id = b_open2;
    insert into _smoke (phase, check_name, ok, detail) values ('P0-3 A', 'an approved driver can take it', r ->> 'code' = 'accepted' and st = 'accepted', (r ->> 'code') || ' / ' || st);
  end if;

  -- P0-4 part A: the server decides who gets a push ---------------------------
  if p4 then
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.enqueue_booking_push(b_acc, array[outsider], 'P0 SMOKE', 'x', '{"type": "general"}'::jsonb, 0);
      s := null;
    exception when others then s := sqlstate; end;
    begin
      execute 'select count(*) from public.push_tokens' into n;
      st := 'readable';
    exception when insufficient_privilege then st := 'refused'; end;
    execute 'reset role';
    select count(*) into n from public.push_outbox where token = outsider;
    insert into _smoke (phase, check_name, ok, detail) values ('P0-4 A', 'a company cannot push its own text to any phone', n = 0, n || ' queued' || coalesce(', ' || s, ''));
    insert into _smoke (phase, check_name, ok, detail) values ('P0-4 A', 'the push token table is closed to the apps', st = 'refused', st);
  end if;

  -- P0-5: the company cancels its own bookings; the driver is told ------------
  if p5 then
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      r := public.cancel_booking_by_company(b_acc, 'P0 smoke');
    exception when others then r := jsonb_build_object('code', 'error: ' || sqlstate || ' ' || sqlerrm); end;
    execute 'reset role';
    select status || '/' || coalesce(cancelled_by, '-') into st from public.bookings where id = b_acc;
    insert into _smoke (phase, check_name, ok, detail) values ('P0-5', 'the company cancels its accepted booking', r ->> 'code' = 'cancelled' and st = 'cancelled/company', (r ->> 'code') || ' / ' || st);
    select count(*) into n from public.notifications
     where user_id = d1 and type = 'booking_cancelled' and data ->> 'booking_id' = b_acc::text;
    insert into _smoke (phase, check_name, ok, detail) values ('P0-5', 'the driver gets one cancellation notice', n = 1, n::text);
    perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      update public.bookings set status = 'pending' where id = b_acc;
      get diagnostics n = row_count;
      s := n || ' rows';
    exception when others then s := 'refused (' || sqlstate || ')'; end;
    begin
      r := public.cancel_booking_by_company(b_run, 'P0 smoke');
    exception when others then r := jsonb_build_object('code', 'error: ' || sqlstate); end;
    execute 'reset role';
    select status into st from public.bookings where id = b_acc;
    insert into _smoke (phase, check_name, ok, detail) values ('P0-5', 'a cancelled booking cannot be revived', st = 'cancelled', s || ' / ' || st);
    select status into st from public.bookings where id = b_run;
    insert into _smoke (phase, check_name, ok, detail) values ('P0-5', 'a trip on the road cannot be cancelled by the company', r ->> 'code' = 'trip_in_progress' and st = 'in_progress', (r ->> 'code') || ' / ' || st);
  end if;
end
$smoke$;

select phase, check_name, case when ok then 'PASS' else 'FAIL' end as result, detail
  from _smoke order by n;

rollback;
