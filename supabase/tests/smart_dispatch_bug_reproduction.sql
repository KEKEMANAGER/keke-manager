-- Smart dispatch: what production does today, on the seed of
-- fixtures/smart_dispatch_seed.sql. Every "BUG:" check holds on production
-- as it is and stops holding once 20261105120000_smart_dispatch.sql is
-- applied; every "SAME:" check must pass both before and after (rules the
-- migration must not change). One transaction, rolled back.
begin;
select * from no_plan();
\ir fixtures/smart_dispatch_seed.sql

create or replace function tests.sd_exact(p_booking text) returns text
language sql security definer set search_path = public as $$
  select tests.sd_names(array_agg(c.candidate_id)) from public.booking_dispatch_candidates(tests.sd(p_booking)) c
$$;

-- What must not change -------------------------------------------------------

select is(tests.sd_exact('COMF'), 'B_LOC,C_DEC,C_FAR,C_LOC,V_LOC,W_ALL',
  'SAME: a comfort job goes to comfort, business and VIP cars, at any seat tier (C_BSY''s calendar is closed)');
select is(tests.sd_exact('VIP'), 'V_LOC', 'SAME: a VIP job goes to VIP cars only');
select is(tests.sd_exact('MB13'), 'MB13', 'SAME: a 13-seat microbus job goes to 13-seat microbuses first');
select is(tests.sd_exact('GUIDE'), 'G_ECO', 'SAME: a job that asks for a guide goes to guides only');
select is(tests.sd_exact('OFFER'), 'E_LOC', 'SAME: a job offered by name goes to that driver only');
select is(tests.sd_exact('FMT'), 'S_ECO', 'SAME: a sedan job goes to sedans only');
select is((select pg_get_function_result('public.booking_dispatch_candidates(uuid)'::regprocedure)),
  'TABLE(candidate_id uuid, is_local boolean)', 'SAME: booking_dispatch_candidates(uuid) returns the same columns');

-- The economy job of 5 Nov: who hears first ------------------------------------

select public.dispatch_new_booking_push(tests.sd('ECO'), 1);
select ok(tests.sd_notices('C_LOC', 'ECO') > 0,
  'BUG: an economy job''s first wave reaches a comfort car');
select ok(tests.sd_notices('V_LOC', 'ECO') > 0,
  'BUG: an economy job''s first wave reaches a VIP car');
select ok(tests.sd_notices('B_LOC', 'ECO') > 0,
  'BUG: an economy job''s first wave reaches a business car');
select is(tests.sd_notices('E_LOC', 'ECO'), 1, 'SAME: the economy car working there is told at once');
select is(tests.sd_notices('E_FAR', 'ECO'), 0, 'SAME: the economy car working elsewhere waits for the second wave');

-- Later: nothing wider, ever ----------------------------------------------------

select tests.sd_advance(3, array['ECO']);
select public.dispatch_due_second_waves();
select is(tests.sd_notices('E_FAR', 'ECO'), 1, 'SAME: the second wave reaches the economy car working elsewhere');
select tests.sd_advance(8, array['ECO']);
select public.dispatch_due_second_waves();
select ok(tests.sd_notices('E_NOL', 'ECO') = 0 and tests.sd_notices('E_NUL', 'ECO') = 0,
  'BUG: eleven minutes on, drivers who list no language never hear about an English job');
select ok(tests.sd_notices('E_BIG', 'ECO') = 0,
  'BUG: eleven minutes on, a 6-8 seat minivan never hears about a 3-5 seat job');
select is(tests.sd_notices('E_RU', 'ECO'), 0, 'SAME: a driver whose languages leave English out is not told');
select is(tests.sd_notices('E_DEC', 'ECO') + tests.sd_notices('C_DEC', 'ECO'), 0, 'SAME: drivers who declined are not told');
select is(tests.sd_notices('E_BSY', 'ECO') + tests.sd_notices('C_BSY', 'ECO'), 0, 'SAME: drivers whose calendar is closed are not told');
select is(tests.sd_notices('E_UNA', 'ECO') + tests.sd_notices('E_BLK', 'ECO') + tests.sd_notices('E_OFF', 'ECO')
          + tests.sd_notices('E_CUA', 'ECO') + tests.sd_notices('HIRED', 'ECO'), 0,
  'SAME: drivers who may not take jobs, and hired drivers, are not told');

-- The push text ------------------------------------------------------------------

select public.dispatch_new_booking_push(tests.sd('FMT'), 1);
select ok(tests.sd_push_texts('S_ECO') like '%2026-11-06T06:00:00.000Z%',
  'BUG: the push shows the stored instant "2026-11-06T06:00:00.000Z", not the time in Tbilisi');
select ok(tests.sd_push_texts('S_ECO') like 'KEKE · ახალი ტრანსფერი! | Tbilisi airport → Kazbegi · %',
  'SAME: the title and the route stay as they were');

-- The admin alert -------------------------------------------------------------------

-- a booking from three days ago that a driver had taken, put back up today
-- the way it was done on 5 Nov: status back to pending, first-dispatch time
-- set to now, then the server's first wave
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code,
                             created_at, dispatch_fallback_sent_at, dispatch_alert_sent_at)
values (tests.sd('OLD'), tests.sd('C1'), tests.sd('S_ECO'), 'transfer', 'accepted', tests.sd_start(), 'Tbilisi airport',
        'Tbilisi hotel', 90, 'sedan', 'economy', 2, 'SD-OLD',
        now() - interval '3 days', now() - interval '3 days', now() - interval '3 days' + interval '5 minutes');
update public.bookings set status = 'pending', driver_id = null, dispatch_fallback_sent_at = now()
 where id = tests.sd('OLD');
select public.dispatch_new_booking_push(tests.sd('OLD'), 1);
select tests.sd_advance(25, array['OLD']);
select public.alert_undispatched_bookings();
select ok(tests.sd_alerts('OLD') = 0,
  'BUG: a booking put back up long after it was created never alerts the admin (25 minutes, nobody took it)');

-- a new booking nobody took: the alert comes five minutes after it was created,
-- before a wider wave at ten minutes could have run
select public.dispatch_new_booking_push(tests.sd('VIP'), 1);
select tests.sd_advance(6, array['VIP']);
select public.alert_undispatched_bookings();
select ok(tests.sd_alerts('VIP') = 1,
  'BUG: the admin is alerted six minutes after a booking was created');

select * from finish();
rollback;
