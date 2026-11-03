-- A host's calendar for each of his cars (20261103130000_vehicle_calendar):
-- a blocked day keeps the car out of every way a job can reach it, and no
-- one else's car, driver or calendar changes. Accounts from
-- fixtures/p0_5_seed.sql: H a host (here given a second car, vH1), S his
-- driver on the minivan vH2, E1..E3 drivers with one sedan each. Every write
-- is made the way PostgREST makes it (role authenticated + the caller's JWT).
-- One transaction, rolled back; nothing leaves the machine.
begin;
select * from no_plan();
\ir fixtures/p0_5_seed.sql

create or replace function tests.vday(p_offset int) returns date language sql stable as $$
  select (now() at time zone 'Asia/Tbilisi')::date + p_offset
$$;
create or replace function tests.block(p_who text, p_vehicle text, p_offset int, p_on boolean) returns text language plpgsql as $$
declare r jsonb;
begin
  perform tests.act_as(tests.p5(p_who));
  r := public.set_vehicle_day_blocked(tests.p5(p_vehicle), tests.vday(p_offset), p_on);
  perform tests.act_as_owner();
  return coalesce(r ->> 'code', case when (r ->> 'ok')::boolean then 'ok' else 'refused' end);
end $$;
create or replace function tests.candidates(p_booking text) returns text language sql security definer set search_path = public as $$
  select coalesce(string_agg(x.name, ',' order by x.name), '')
    from (select (select n from unnest(array['E1','E2','E3','H','S']) n where tests.p5(n) = c.candidate_id) as name
            from public.booking_dispatch_candidates(tests.p5(p_booking)) c) x
$$;
create or replace function tests.calendar(p_who text, p_vehicle text, p_from int, p_to int) returns text language plpgsql as $$
declare out text;
begin
  perform tests.act_as(tests.p5(p_who));
  select coalesce(string_agg((c.day - tests.vday(0))::text || ':' || c.status, ',' order by c.day), '') into out
    from public.vehicle_calendar(tests.p5(p_vehicle), tests.vday(p_from), tests.vday(p_to)) c;
  perform tests.act_as_owner();
  return out;
end $$;
create or replace function tests.available(p_names text[], p_offset int) returns text language plpgsql as $$
declare ids text[]; out text[];
begin
  select array_agg(tests.p5(n)::text) into ids from unnest(p_names) n;
  perform tests.act_as(tests.p5('C1'));
  out := public.filter_drivers_available_for_window(ids,
           (tests.vday(p_offset) + time '10:00') at time zone 'Asia/Tbilisi',
           (tests.vday(p_offset) + time '12:00') at time zone 'Asia/Tbilisi');
  perform tests.act_as_owner();
  return coalesce((select string_agg(n, ',' order by n) from unnest(p_names) n where tests.p5(n)::text = any (out)), '');
end $$;
grant execute on all functions in schema tests to public;

-- H gets a second car of his own (a sedan) and is a host; vH2 is put to work;
-- a new minivan job on day +16 (a day none of them has a job), which only vH2
-- can serve: H as its owner, S as his driver on it.
select tests.act_as_owner();
insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
values (tests.p5('vH1'), tests.p5('H'), 'sedan', 'comfort', 'Test model', 'TEST-vH1', 'approved', true, true);
update public.vehicles set is_active = true where id = tests.p5('vH2');
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                             vehicle_type, vehicle_class, passengers, voucher_code)
values (tests.p5('NEWV'), tests.p5('C1'), 'transfer', 'pending',
        ((tests.vday(16) + time '10:00') at time zone 'Asia/Tbilisi')::text, 'Test airport', 'Test hotel', 150,
        'minivan', 'comfort', 2, 'V-NEWV');

-- 1. who may keep it
select is(tests.block('E1', 'vE1', 16, true), 'not_a_host', 'V1 a driver with one car is not a host: no car calendar');
select is(tests.block('H', 'vE1', 16, true), 'not_your_vehicle', 'V2 a host cannot block another driver''s car');
select is(tests.block('S', 'vH2', 16, true), 'not_your_vehicle', 'V3 nor can the driver he gave the car to');
select is(tests.block('H', 'vH2', -1, true), 'past_day', 'V4 a day already gone cannot be blocked');

-- 2. before: S is offered the minivan job and is free that day
select is(tests.candidates('NEWV'), 'H,S', 'V5 before: the minivan job is offered to H and S (the two who may drive vH2)');
select is(tests.available(array['E1','H','S'], 16), 'E1,H,S', 'V6 before: the company sees E1, H and S free that day');

-- 3. H blocks day +16 for vH2
select is(tests.block('H', 'vH2', 16, true), 'ok', 'V7 the host blocks a whole day for his minivan');
select is(tests.block('H', 'vH2', 16, true), 'ok', 'V8 blocking it again changes nothing');
select is((select count(*)::int from public.driver_schedules where source = 'vehicle' and vehicle_id = tests.p5('vH2')), 1,
  'V9 one row for that day');
select is((select (start_time = (tests.vday(16)::timestamp at time zone 'Asia/Tbilisi'))
              and (end_time = ((tests.vday(17))::timestamp at time zone 'Asia/Tbilisi'))
              and driver_id is null and booking_id is null
             from public.driver_schedules where source = 'vehicle' and vehicle_id = tests.p5('vH2')), true,
  'V10 it runs 00:00 to 24:00 Tbilisi time and belongs to the car, not to a driver');
select is(tests.calendar('H', 'vH2', 15, 17), '16:blocked', 'V11 the host''s calendar shows the day blocked');
select is(tests.calendar('S', 'vH2', 15, 17), '', 'V12 nobody but the owner reads it');

-- 4. ... and every way a job reaches the car sees it
select is(tests.candidates('NEWV'), '', 'V13 the minivan job is no longer offered to anyone on vH2');
select is(tests.available(array['E1','H','S'], 16), 'E1,H', 'V14 the company''s picker shows S busy that day (his only car is blocked), H free (his other car is not)');
select is(tests.available(array['E1','H','S'], 17), 'E1,H,S', 'V15 and free again the next day');
select tests.act_as(tests.p5('H'));
select is((public.accept_booking_atomic(tests.p5('NEWV'), tests.p5('S'), tests.p5('vH2'))) ->> 'code', 'vehicle_busy',
  'V16 taking the job with vH2 that day is refused: vehicle busy');
select tests.act_as_owner();
select is((select status from public.bookings where id = tests.p5('NEWV')), 'pending', 'V17 and the job stays open');
select is(tests.try_sql(format($q$insert into public.driver_schedules (driver_id, vehicle_id, booking_id, start_time, end_time, source)
  values (%L, %L, %L, %L, %L, 'booking')$q$, tests.p5('S'), tests.p5('vH2'), tests.p5('NEWV'),
  (tests.vday(16) + time '10:00') at time zone 'Asia/Tbilisi', (tests.vday(16) + time '12:00') at time zone 'Asia/Tbilisi')), -2,
  'V18 no booking can be written onto the car that day by any path (the table refuses it)');

-- 5. a day the car is already booked cannot be blocked
select is(tests.block('H', 'vH2', 14, true),
  case when exists (select 1 from public.driver_schedules s where s.booking_id = tests.p5('FLT')
                     and s.start_time < (tests.vday(15)::timestamp at time zone 'Asia/Tbilisi')
                     and s.end_time > (tests.vday(14)::timestamp at time zone 'Asia/Tbilisi'))
       then 'vehicle_has_booking' else 'ok' end,
  'V19 the day of FLT (S on vH2) cannot be blocked: the car has a job');
select ok(tests.calendar('H', 'vH2', 14, 15) like '%:booked%', 'V20 the calendar shows that day as booked');

-- 6. nobody writes a car's day directly
select tests.act_as(tests.p5('S'));
select isnt(tests.try_sql(format($q$insert into public.driver_schedules (driver_id, vehicle_id, start_time, end_time, source)
  values (null, %L, now() + interval '30 days', now() + interval '31 days', 'vehicle')$q$, tests.p5('vE1'))), 1,
  'V21 a driver cannot write a blocked day for any car himself');
select isnt(tests.try_sql(format($q$insert into public.driver_schedules (driver_id, vehicle_id, start_time, end_time, source)
  values (%L, %L, now() + interval '30 days', now() + interval '31 days', 'vehicle')$q$, tests.p5('S'), tests.p5('vE1'))), 1,
  'V22 not even under his own name');
select tests.act_as_owner();

-- 7. the drivers' own calendar is as before
select tests.act_as(tests.p5('E1'));
select is(tests.try_sql(format($q$insert into public.driver_schedules (driver_id, booking_id, start_time, end_time, source)
  values (%L, null, %L, %L, 'manual')$q$, tests.p5('E1'), (tests.vday(20))::timestamp at time zone 'Asia/Tbilisi',
  (tests.vday(20) + time '23:59') at time zone 'Asia/Tbilisi')), 1, 'V23 a driver still blocks a day for himself');
select tests.act_as_owner();
select is(tests.available(array['E1','H','S'], 20), 'H,S', 'V24 and is busy that day, as before');

-- 8. freeing the day gives the car back
select is(tests.block('H', 'vH2', 16, false), 'ok', 'V25 the host frees the day');
select is(tests.calendar('H', 'vH2', 15, 17), '', 'V26 the calendar is clear');
select is(tests.candidates('NEWV'), 'H,S', 'V27 the job is offered on vH2 again');
select tests.act_as(tests.p5('H'));
select is((public.accept_booking_atomic(tests.p5('NEWV'), tests.p5('S'), tests.p5('vH2'))) ->> 'ok', 'true',
  'V28 and can be taken with vH2');
select tests.act_as_owner();

-- 9. a deleted car takes its calendar with it
select is(tests.block('H', 'vH1', 25, true), 'ok', 'V29 the host blocks a day for his other car');
select tests.act_as(tests.p5('H'));
select is(tests.try_sql(format('delete from public.vehicles where id = %L', tests.p5('vH1'))), 1, 'V30 he deletes that car');
select tests.act_as_owner();
select is((select count(*)::int from public.driver_schedules where source = 'vehicle' and vehicle_id = tests.p5('vH1')), 0,
  'V31 and its blocked days are gone with it');
select is(tests.block('H', 'vH2', 26, true), 'not_a_host', 'V32 with one car left he is no longer a host');

select * from finish();
rollback;
