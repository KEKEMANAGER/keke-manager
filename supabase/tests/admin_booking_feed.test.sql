-- The admin booking feed (20261106150000_admin_booking_feed.sql), on the
-- smart-dispatch seed. Runs as the database owner except where it acts as an
-- app user; everything is rolled back. net.http_post is the shim's recorder.
-- The seed clears every notice it caused, so each check here makes its own.
begin;
select plan(25);
\ir fixtures/smart_dispatch_seed.sql

-- a company books, the way the app does it (a direct insert as the company)
select tests.act_as(tests.sd('C1'));
select lives_ok($$
  insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                               vehicle_type, vehicle_class, requested_capacity_tier, passengers, voucher_code)
  values (tests.sd('N_FMT'), tests.sd('C1'), 'transfer', 'pending', '2026-11-06T06:00:00.000Z', 'Tbilisi airport', 'Kazbegi', 150,
          'sedan', 'economy', null, 2, 'SD-N_FMT'),
         (tests.sd('N_ECO'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(), 'Tbilisi airport', 'Tbilisi hotel', 85.50,
          'minivan', 'economy', 'minivan_3_5', 5, 'SD-N_ECO') $$,
  'a company books two trips');
select lives_ok($$
  insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location, price_gel,
                               vehicle_type, vehicle_class, passengers, voucher_code)
  values (tests.sd('N_OFF'), tests.sd('C1'), tests.sd('E_LOC'), 'transfer', 'pending', tests.sd_start(72), 'Tbilisi airport', 'Tbilisi hotel', 120,
          'minivan', 'economy', 4, 'SD-N_OFF') $$,
  'and offers a third to a driver by name');
select tests.act_as_owner();

select is((select count(*)::int from public.notifications n
            where n.user_id = tests.sd('ADM') and n.type = 'admin_booking_feed' and n.data ->> 'event' = 'created'),
          3, 'each new booking told the admin once');
select is((select n.title || ' | ' || n.body from public.notifications n where n.user_id = tests.sd('ADM')
             and n.type = 'admin_booking_feed' and n.data ->> 'booking_id' = tests.sd('N_FMT')::text),
          'KEKE · ახალი ჯავშანი | SD-N_FMT · Test Tours SD · Tbilisi airport → Kazbegi · 6 ნოემბერი, 10:00 · სედანი ეკონომი · 2 მგზ. · 150 ₾',
          'the created notice: code, company, route, Tbilisi time, car, passengers, price');
select ok((select n.body from public.notifications n where n.user_id = tests.sd('ADM') and n.type = 'admin_booking_feed'
             and n.data ->> 'booking_id' = tests.sd('N_ECO')::text) like '% · მინივენი ეკონომი (3–5 ადგ.) · 5 მგზ. · 85.5 ₾',
          'the seat tier reads as seats, the price without trailing zeros');
select ok((select n.body from public.notifications n where n.user_id = tests.sd('ADM') and n.type = 'admin_booking_feed'
             and n.data ->> 'booking_id' = tests.sd('N_OFF')::text) like '% · 120 ₾ · შეთავაზება: Test E_LOC',
          'a booking offered by name says to whom');
select is((select n.data from public.notifications n where n.user_id = tests.sd('ADM') and n.type = 'admin_booking_feed'
             and n.data ->> 'booking_id' = tests.sd('N_FMT')::text),
          jsonb_build_object('booking_id', tests.sd('N_FMT')::text, 'event', 'created', 'code', 'SD-N_FMT', 'type', 'admin_booking_feed'),
          'its data: the booking, the event, the code, the type');
select is((select count(*)::int from public.notifications n where n.type = 'admin_booking_feed' and n.user_id <> tests.sd('ADM')),
          0, 'nobody but the admin hears it');
select ok(exists (select 1 from net.http_calls r where r.body::text like '%KEKE · ახალი ჯავშანი%'),
          'the admin''s phone gets the push, like every other notice');

-- a driver takes a job, the way the app does it
select tests.act_as(tests.sd('E_LOC'));
select is(public.accept_booking_atomic(tests.sd('N_ECO'), tests.sd('E_LOC'), tests.sd('vE_LOC')) ->> 'ok', 'true', 'a driver takes N_ECO');
select tests.act_as_owner();
select ok((select n.title = 'KEKE · ჯავშანი აიღეს' and n.body like 'SD-N_ECO · Test E_LOC (Test model SD-E_LOC) · Tbilisi airport → Tbilisi hotel · %'
             from public.notifications n where n.user_id = tests.sd('ADM') and n.data ->> 'booking_id' = tests.sd('N_ECO')::text
              and n.data ->> 'event' = 'taken'),
          'taken: who, with which car');

-- KEKE takes him off it: open again
update public.bookings set status = 'pending', driver_id = null, vehicle_id = null, driver_display_name = null,
                           driver_phone = null, driver_plate = null where id = tests.sd('N_ECO');
select ok((select n.title = 'KEKE · ჯავშანი ისევ ღიაა' and n.body like 'SD-N_ECO · Test E_LOC აღარ არის · Test Tours SD · %'
             from public.notifications n where n.user_id = tests.sd('ADM') and n.data ->> 'booking_id' = tests.sd('N_ECO')::text
              and n.data ->> 'event' = 'reopened'),
          'open again: who had it');

-- the company cancels one, the way the app does it
select tests.act_as(tests.sd('C1'));
select lives_ok($$ update public.bookings set status = 'cancelled' where id = tests.sd('N_FMT') $$, 'the company cancels N_FMT');
select tests.act_as_owner();
select ok((select n.title = 'KEKE · ჯავშანი გაუქმდა' and n.body = 'SD-N_FMT · გააუქმა კომპანიამ (Test Tours SD) · Tbilisi airport → Kazbegi · 6 ნოემბერი, 10:00'
             from public.notifications n where n.user_id = tests.sd('ADM') and n.data ->> 'booking_id' = tests.sd('N_FMT')::text
              and n.data ->> 'event' = 'cancelled'),
          'cancelled: by whom (the company named once)');

-- nothing else says anything
update public.bookings set to_location = 'Tbilisi hotel 2', price_gel = 130 where id = tests.sd('N_OFF');
select is((select count(*)::int from public.notifications n where n.type = 'admin_booking_feed'
             and n.data ->> 'booking_id' = tests.sd('N_OFF')::text), 1, 'an edit that is not status or driver says nothing');

-- a convoy coordinator says nothing
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                             vehicle_type, vehicle_class, passengers, voucher_code, is_group_master, group_code)
values (tests.sd('MASTER'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(), 'A', 'B', 100, 'minivan', 'economy', 30, 'SD-MASTER', true, 'G-SD');
select is((select count(*)::int from public.notifications n where n.type = 'admin_booking_feed'
             and n.data ->> 'booking_id' = tests.sd('MASTER')::text), 0, 'a convoy coordinator says nothing');

-- the named driver takes the offer: no "before"
select tests.act_as(tests.sd('E_LOC'));
select is(public.accept_booking_atomic(tests.sd('N_OFF'), tests.sd('E_LOC'), tests.sd('vE_LOC')) ->> 'ok', 'true', 'the named driver takes N_OFF');
select tests.act_as_owner();
select ok((select n.body not like '%ადრე:%' and n.body like 'SD-N_OFF · Test E_LOC (Test model SD-E_LOC) · %'
             from public.notifications n where n.user_id = tests.sd('ADM') and n.data ->> 'booking_id' = tests.sd('N_OFF')::text
              and n.data ->> 'event' = 'taken'),
          'taken by the driver it was offered to: no "before"');

-- KEKE gives it to another driver (what the reminders do when the first does not confirm)
select public.reassign_booking_to_driver(tests.sd('N_OFF'), tests.sd('E_FAR'), tests.sd('vE_FAR'), 'Test E_FAR', null, null);
select is((select string_agg(n.body, ' | ' order by n.created_at, n.id) from public.notifications n
             where n.user_id = tests.sd('ADM') and n.data ->> 'booking_id' = tests.sd('N_OFF')::text and n.data ->> 'event' = 'taken'
               and n.body like '%ადრე:%'),
          'SD-N_OFF · Test E_FAR (Test model SD-E_FAR) · ადრე: Test E_LOC · Tbilisi airport → Tbilisi hotel 2 · '
            || public.booking_start_label_ka(tests.sd_start(72)) || ' · 130 ₾',
          'given to another driver: who has it now and who had it');

-- the new driver drops it, the way the app does it
select tests.act_as(tests.sd('E_FAR'));
select lives_ok($$ update public.bookings set status = 'cancelled' where id = tests.sd('N_OFF') $$, 'the driver cancels N_OFF');
select tests.act_as_owner();
select ok((select n.body like 'SD-N_OFF · გააუქმა მძღოლმა (Test E_FAR) · Test Tours SD · %'
             from public.notifications n where n.user_id = tests.sd('ADM') and n.data ->> 'booking_id' = tests.sd('N_OFF')::text
              and n.data ->> 'event' = 'cancelled'),
          'cancelled by the driver: which one');
select is((select count(*)::int from public.notifications n where n.type = 'admin_booking_feed'
             and n.data ->> 'booking_id' = tests.sd('N_OFF')::text), 4,
          'N_OFF told its whole story once: created, taken, given to another, cancelled');

-- rights
select ok(not has_function_privilege('authenticated', 'public.admin_booking_feed_message(public.bookings,text,uuid)', 'execute')
          and not has_function_privilege('anon', 'public.admin_booking_feed_message(public.bookings,text,uuid)', 'execute'),
          'the apps cannot build feed messages');

-- a broken message never stops a booking
create or replace function public.admin_booking_feed_message(b public.bookings, p_event text, p_old_driver uuid default null)
returns jsonb language plpgsql as $$ begin raise exception 'boom'; end $$;
select lives_ok($$ insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                                               vehicle_type, vehicle_class, passengers, voucher_code)
                   values (tests.sd('AFTERBOOM'), tests.sd('C1'), 'transfer', 'pending', tests.sd_start(), 'A', 'B', 50, 'sedan', 'economy', 1, 'SD-AFTERBOOM') $$,
                'a failure in the feed does not stop a booking');
select ok(exists (select 1 from public.bookings where id = tests.sd('AFTERBOOM')), 'and the booking is there');

select * from finish();
rollback;
