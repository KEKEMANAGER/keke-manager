-- P0-6: a booking's company, its convoy and its money are not the apps' to
-- rewrite - and everything the apps legitimately do still works.
-- Separate accounts: companies C1 and C2, admin ADM, approved drivers E1 E2 E3,
-- fleet owner H, a driver KEKE has not approved (U6) and a blocked one (B6).
-- Every write below is made the way PostgREST makes it (role authenticated +
-- the caller's JWT), so the UPDATE policies, their OR-combination and the
-- BEFORE triggers act together as in production. One transaction, rolled
-- back; nothing leaves the machine (net.http_post is the shim's recorder).
begin;
select * from no_plan();
\ir fixtures/p0_5_seed.sql

-- more accounts
insert into auth.users (id, email)
values (tests.p5('U6'), 'p06-u6@test.invalid'), (tests.p5('B6'), 'p06-b6@test.invalid');
insert into public.users (id, role, full_name, email, is_verified, verification_status, is_available, is_blocked)
values (tests.p5('U6'), 'driver', 'Test U6', 'p06-u6@test.invalid', false, 'pending', true, false),
       (tests.p5('B6'), 'driver', 'Test B6', 'p06-b6@test.invalid', true, 'approved', true, true);
insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
values (tests.p5('vU6'), tests.p5('U6'), 'sedan', 'comfort', 'Test model', 'TEST-vU6', 'approved', true, true),
       (tests.p5('vB6'), tests.p5('B6'), 'sedan', 'comfort', 'Test model', 'TEST-vB6', 'approved', true, true);

-- more bookings (C1's unless said; days from now)
insert into public.bookings (id, company_id, driver_id, vehicle_id, kind, status, date_display, from_location, to_location,
                             price_gel, client_price, commission, vehicle_type, vehicle_class, passengers, voucher_code,
                             is_group_master, driver_display_name, driver_phone, driver_plate)
select tests.p5(b), tests.p5(co), case when d is null then null else tests.p5(d) end,
       case when v is null then null else tests.p5(v) end, 'transfer', st, (now() + make_interval(days => dd))::text,
       'Test airport', 'Test hotel', 150, 180, 30, 'sedan', 'comfort', 2, 'V-' || b, coalesce(gm, false),
       case when d is null then null else 'Test ' || d end, case when d is null then null else '+995 500 000 000' end,
       case when v is null then null else 'TEST-' || v end
  from (values
    ('OPEN6',  'C1', null::text, null::text, 'pending',   40, null::boolean),
    ('OPEN7',  'C1', null,       null,       'pending',   41, null),
    ('OFFER6', 'C1', 'E2',       'vE2',      'pending',   42, null),
    ('OFFER7', 'C1', 'E2',       'vE2',      'pending',   43, null),
    ('PEND6',  'C1', null,       null,       'pending',   44, null),
    ('ACC6',   'C1', null,       null,       'pending',   45, null),
    ('ACC7',   'C1', null,       null,       'pending',   46, null),
    ('MSTX',   'C1', null,       null,       'cancelled', 47, true),
    ('C2OPEN', 'C2', null,       null,       'pending',   48, null)
  ) as x(b, co, d, v, st, dd, gm);
select tests.act_as(tests.p5('E1'));
select public.accept_booking_atomic(tests.p5('ACC6'), tests.p5('E1'), tests.p5('vE1'));
select public.accept_booking_atomic(tests.p5('ACC7'), tests.p5('E1'), tests.p5('vE1'));
select tests.act_as_owner();

-- ===== A. The policies, alone and together =====================================

select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'bookings'
            and cmd in ('UPDATE', 'ALL') and (btrim(coalesce(with_check, '')) = 'true' or 'public' = any (roles))),
  0, 'A1 no UPDATE policy on bookings accepts any new row, and none is for role public');
select is((select string_agg(policyname, ', ' order by policyname) from pg_policies
            where schemaname = 'public' and tablename = 'bookings' and cmd = 'UPDATE'),
  'bookings_admin_update, bookings_update_assigned_driver, bookings_update_company',
  'A2 three UPDATE policies remain: admin, the assigned driver, the company');
select is((select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'bookings'
            and cmd = 'UPDATE' and with_check is distinct from qual), 0,
  'A3 each remaining UPDATE policy checks the new row exactly as it checks the old one');
select is((select string_agg(tgname, ' > ' order by tgname) from pg_trigger
            where tgrelid = 'public.bookings'::regclass and not tgisinternal and (tgtype & 2) = 2 and (tgtype & 16) = 16),
  'bookings_guard_cancellation > bookings_guard_direct_writes > bookings_guard_ownership > bookings_stamp_lifecycle',
  'A4 before-update triggers fire in this order: P0-5 guard, P0-3 guard, P0-6 guard, lifecycle stamps');

select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set company_id = %L, driver_id = %L where id = %L',
                               tests.p5('C2'), tests.p5('C1'), tests.p5('OPEN6'))), -1,
  'A5 a company cannot use "I am the driver" to pass the new-row check while moving its booking to another company');
select tests.act_as(tests.p5('E1'));
select is(tests.try_sql(format('update public.bookings set company_id = %L where id = %L', tests.p5('E1'), tests.p5('ACC6'))), -1,
  'A6 a driver cannot use the company''s rights to take over the booking he drives');
select tests.act_as(tests.p5('E2'));
select ok(tests.try_sql(format('update public.bookings set price_gel = 1 where id = %L', tests.p5('ACC6'))) <= 0,
  'A7 a driver who is not on the booking changes nothing');
select tests.act_as_anon();
select ok(tests.try_sql(format('update public.bookings set price_gel = 1 where id = %L', tests.p5('OPEN6'))) <= 0,
  'A8 an anonymous caller changes nothing');
select tests.act_as_owner();

-- ===== B. Adversarial: what P0-6 refuses ========================================

-- B1 tenancy and identity
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set company_id = %L where id = %L', tests.p5('C2'), tests.p5('DONE'))), -1,
  'B1 a company cannot hand its finished booking to another company');
select is(tests.try_sql(format('update public.bookings set id = gen_random_uuid() where id = %L', tests.p5('OPEN6'))), -1,
  'B2 a company cannot change a booking''s id');
select is(tests.try_sql(format('update public.bookings set created_at = now() - interval ''1 year'' where id = %L', tests.p5('OPEN6'))), -1,
  'B3 a company cannot backdate a booking''s creation');

-- B2 convoys: another company's, a closed one, after creation
select tests.act_as(tests.p5('C2'));
select is(tests.try_sql(format('update public.bookings set driver_id = %L, parent_booking_id = %L, leg_index = 9 where id = %L',
                               tests.p5('C2'), tests.p5('MST'), tests.p5('C2OPEN'))), -1,
  'B4 company C2 cannot hang its booking, with itself as the driver, under company C1''s convoy');
select is(tests.try_sql(format('update public.bookings set parent_booking_id = %L where id = %L', tests.p5('MST'), tests.p5('C2OPEN'))), -1,
  'B5 nor without a driver');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, parent_booking_id, leg_index)
   values (%L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, %L, 8)',
  tests.p5('C2'), (now() + interval '50 days')::text, tests.p5('MST'))), -1,
  'B6 company C2 cannot create a booking inside company C1''s convoy');
select ok(not public.booking_convoy_open_for(tests.p5('MST'), tests.p5('C1')),
  'B7 and cannot even ask whether C1''s convoy is open');
select tests.act_as_owner();
select ok(not exists (select 1 from public.bookings where parent_booking_id = tests.p5('MST')
                        and (company_id = tests.p5('C2') or driver_id = tests.p5('C2'))),
  'B8 nothing of C2 hangs in C1''s convoy, so C2 is no participant of it');

select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, parent_booking_id, leg_index)
   values (%L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, %L, 1)',
  tests.p5('C1'), (now() + interval '51 days')::text, tests.p5('MSTX'))), -1,
  'B9 a company cannot add a car to its own cancelled convoy');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, parent_booking_id, leg_index)
   values (%L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, %L, 1)',
  tests.p5('C1'), (now() + interval '51 days')::text, tests.p5('OPEN6'))), -1,
  'B10 nor hang a car under a booking that is not a convoy');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, is_group_master, parent_booking_id)
   values (%L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, true, %L)',
  tests.p5('C1'), (now() + interval '51 days')::text, tests.p5('MST'))), -1,
  'B11 nor make a convoy inside a convoy');
select is(tests.try_sql(format('update public.bookings set parent_booking_id = null where id = %L', tests.p5('LEG2'))), -1,
  'B12 a company cannot pull a car out of its convoy');
select is(tests.try_sql(format('update public.bookings set parent_booking_id = %L where id = %L', tests.p5('MST2'), tests.p5('LEG2'))), -1,
  'B13 nor move it to another of its convoys');
select is(tests.try_sql(format('update public.bookings set leg_index = 7 where id = %L', tests.p5('LEG2'))), -1,
  'B14 nor renumber it');
select is(tests.try_sql(format('update public.bookings set group_code = ''X'' where id = %L', tests.p5('LEG2'))), -1,
  'B15 nor change the convoy code');
select is(tests.try_sql(format('update public.bookings set parent_booking_id = %L where id = %L', tests.p5('MST'), tests.p5('OPEN6'))), -1,
  'B16 nor turn an ordinary booking into a convoy car');

-- B3 who may be put on a booking
select is(tests.try_sql(format('update public.bookings set driver_id = %L where id = %L', tests.p5('C1'), tests.p5('OPEN7'))), -1,
  'B17 a company cannot name itself the driver');
select is(tests.try_sql(format('update public.bookings set driver_id = %L where id = %L', tests.p5('C2'), tests.p5('OPEN7'))), -1,
  'B18 nor another company');
select is(tests.try_sql(format('update public.bookings set driver_id = %L where id = %L', tests.p5('U6'), tests.p5('OPEN7'))), -1,
  'B19 nor a driver KEKE has not approved');
select is(tests.try_sql(format('update public.bookings set driver_id = %L where id = %L', tests.p5('B6'), tests.p5('OPEN7'))), -1,
  'B20 nor a blocked driver');
select is(tests.try_sql(format('update public.bookings set driver_id = %L, vehicle_id = %L where id = %L',
                               tests.p5('E2'), tests.p5('vE1'), tests.p5('OPEN7'))), -1,
  'B21 nor an approved driver with another driver''s vehicle');
select is(tests.try_sql(format('update public.bookings set vehicle_id = %L where id = %L', tests.p5('vE1'), tests.p5('OPEN7'))), -1,
  'B22 nor a vehicle without a driver');
select is(tests.try_sql(format('update public.bookings set driver_display_name = ''Fake'', driver_phone = ''+1'' where id = %L', tests.p5('OPEN7'))), -1,
  'B23 nor a driver''s name and phone without a driver');
select is(tests.try_sql(format('update public.bookings set driver_id = null where id = %L', tests.p5('OFFER7'))), -1,
  'B24 taking the driver off but leaving his name, phone and plate is refused');
select is(tests.try_sql(format('update public.bookings set driver_display_name = ''Someone else'' where id = %L', tests.p5('ACC6'))), -1,
  'B25 once a driver took the job, his name on it is not the company''s to change');
select is(tests.try_sql(format('update public.bookings set driver_phone = ''+995 599 999 999'' where id = %L', tests.p5('ACC6'))), -1,
  'B26 nor his phone');
select is(tests.try_sql(format('update public.bookings set driver_plate = ''XX-000-XX'' where id = %L', tests.p5('ACC6'))), -1,
  'B27 nor the plate');
select is(tests.try_sql(format('update public.bookings set vehicle_id = %L where id = %L', tests.p5('vE3'), tests.p5('ACC6'))), -1,
  'B28 nor the vehicle');
select is(tests.try_sql(format('update public.bookings set is_emergency_replacement = true where id = %L', tests.p5('ACC6'))), -1,
  'B29 nor mark it an emergency replacement');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, driver_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1)',
  tests.p5('C1'), tests.p5('U6'), (now() + interval '52 days')::text)), -1,
  'B30 a new booking cannot be given to a driver KEKE has not approved');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, driver_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1)',
  tests.p5('C1'), tests.p5('C1'), (now() + interval '52 days')::text)), -1,
  'B31 nor to the company itself');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, driver_id, vehicle_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers)
   values (%L, %L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1)',
  tests.p5('C1'), tests.p5('E1'), tests.p5('vE2'), (now() + interval '52 days')::text)), -1,
  'B32 nor to a driver with someone else''s vehicle');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, vehicle_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1)',
  tests.p5('C1'), tests.p5('vE1'), (now() + interval '52 days')::text)), -1,
  'B33 nor carry a vehicle without a driver');

-- B4 the server's fields: never by a company, empty on a new booking
select is(tests.try_sql(format('update public.bookings set %s where id = %L', x.setter, tests.p5('ACC6'))), -1,
          'B34 a company cannot write ' || x.label)
  from (values
    ('reminder_24h_sent = true', 'the 12-hour reminder flag'),
    ('reminder_1h_sent = true, reminder_1h_sent_at = now()', 'the confirmation-request flag'),
    ('reminder_3h_sent = true', 'the 3-hour reminder flag'),
    ('reminder_45m_sent_at = now()', 'the final reminder time'),
    ('driver_confirmed_1h = true', 'the driver''s confirmation'),
    ('driver_confirmed_at = now()', 'the driver''s confirmation time'),
    ('company_unconfirmed_alert_sent = true', 'the unconfirmed-driver alert flag'),
    ('reassign_count = 5', 'the reassignment count'),
    ('auto_reassigned_at = now()', 'the automatic reassignment time'),
    ('dispatch_fallback_sent_at = now()', 'the dispatch fallback time'),
    ('dispatch_wave2_due_at = now()', 'the second-wave time'),
    ('dispatch_alert_sent_at = now()', 'the no-driver alert time'),
    ('odometer_start_at = now()', 'the driver''s odometer record'),
    ('payment_status = ''paid''', 'the driver''s payment confirmation'),
    ('payment_confirmed_at = now(), payment_confirmed_by = auth.uid()', 'who confirmed the payment'),
    ('breakdown_location = ''Somewhere''', 'the breakdown place'),
    ('host_driver_id = ' || quote_literal(tests.p5('H')), 'the fleet owner')
  ) as x(setter, label);
select is(tests.try_sql(format('update public.bookings set completed_at = now() - interval ''3 days'' where id = %L', tests.p5('DONE'))), -1,
  'B35 a company cannot backdate a completion');
select is(tests.try_sql(format('update public.bookings set odometer_end_at = now() where id = %L', tests.p5('DONE'))), -1,
  'B36 nor rewrite the driver''s odometer record of a finished trip');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, %s)
   values (%L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, %s)',
  x.col, tests.p5('C1'), (now() + interval '53 days')::text, x.val)), -1,
  'B37 a new booking cannot carry ' || x.col)
  from (values
    ('reminder_24h_sent', 'true'), ('completed_at', 'now()'), ('cancelled_by', '''company'''),
    ('dispatch_fallback_sent_at', 'now()'), ('reassign_count', '2'), ('payment_status', '''paid'''),
    ('host_driver_id', quote_literal(tests.p5('H'))), ('odometer_start_at', 'now()'), ('driver_confirmed_at', 'now()'),
    ('is_emergency_replacement', 'true')
  ) as x(col, val);

-- B5 money of finished trips, and the driver's pay after he took the job
select is(tests.try_sql(format('update public.bookings set %s where id = %L', x.setter, tests.p5('DONE'))), -1,
          'B38 the money of a completed trip is final: ' || x.setter)
  from (values ('price_gel = 1'), ('client_price = 1'), ('commission = 0'), ('driver_payout_gel = 0'),
               ('price_net = 1'), ('price_gross = 1'), ('payment_method = ''card'''), ('price_includes_fuel = true')) as x(setter);
select is(tests.try_sql(format('update public.bookings set price_gel = 1 where id = %L', tests.p5('CNL'))), -1,
  'B39 and of a cancelled one');
select is(tests.try_sql(format('update public.bookings set price_gel = 1 where id = %L', tests.p5('REJ'))), -1,
  'B40 and of a declined one');
select is(tests.try_sql(format('update public.bookings set driver_payout_gel = 1 where id = %L', tests.p5('ACC6'))), -1,
  'B41 the driver''s pay does not change after he took the job');
select is(tests.try_sql(format('update public.bookings set driver_payout_gel = 1 where id = %L', tests.p5('RUN'))), -1,
  'B42 nor during the trip');
select tests.act_as_owner();

-- B6 the driver's side (P0-3), with P0-6 in place
select tests.act_as(tests.p5('E1'));
select is(tests.try_sql(format('update public.bookings set price_gel = 1 where id = %L', tests.p5('ACC6'))), -1,
  'B43 the driver cannot change the price');
select is(tests.try_sql(format('update public.bookings set driver_payout_gel = 999 where id = %L', tests.p5('ACC6'))), -1,
  'B44 nor his own pay');
select is(tests.try_sql(format('update public.bookings set price_gel = 1 where id = %L', tests.p5('DONE'))), -1,
  'B45 nor the money of his finished trip');
select is(tests.try_sql(format('update public.bookings set payment_status = ''paid'' where id = %L', tests.p5('ACC6'))), -1,
  'B46 nor confirm payment before the trip is completed');
select tests.act_as_anon();
select ok(not has_function_privilege('anon', 'public.booking_driver_assignable(uuid, uuid)', 'execute'),
  'B47 an anonymous caller cannot ask whether a driver may be given jobs');
select tests.act_as(tests.p5('U6'));
select is(public.booking_driver_assignable(tests.p5('E1'), null), false,
  'B47a nor can a driver (here one KEKE has not approved) use it to look up other drivers');
select tests.act_as(tests.p5('C1'));
select is(public.booking_driver_assignable(tests.p5('E1'), tests.p5('vE1')), true,
  'B47b a company gets the answer it needs to choose a driver');
select tests.act_as_owner();

-- B7 the server's own entry points do not open another company's bookings either
select tests.act_as(tests.p5('C2'));
select is(public.accept_booking_atomic(tests.p5('OPEN7'), tests.p5('E2'), tests.p5('vE2')) ->> 'code', 'forbidden',
  'B48 company C2 cannot put a driver on company C1''s booking through the server''s acceptance');
select is(public.cancel_booking_by_company(tests.p5('ACC'), 'test') ->> 'code', 'forbidden',
  'B49 nor cancel it through the server''s cancellation');
select tests.act_as_owner();

-- ===== C. Legitimate work: nothing the apps do is refused ========================

-- C1 the company's edit (the app's own field list, with the update time and the
-- "updated" flag for the driver)
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format(
  'update public.bookings set from_location = ''Kutaisi airport'', from_location_type = ''airport'', from_location_link = ''https://maps.example/a'',
          to_location = ''Batumi'', to_location_type = ''hotel'', to_location_link = ''https://maps.example/b'', route = ''"Kutaisi - Batumi"'',
          date_display = %L, passengers = 3, vehicle_type = ''sedan'', vehicle_class = ''comfort'', flight_number = ''A9 123'',
          meet_greet = true, sign_text = ''Mr Test'', pickup_sign_logo_url = ''https://files.example/logo.png'',
          passenger_name = ''Test Tourist'', passenger_phone = ''+995 555 000 000'', comment = ''edited'', client_price = 200,
          price_includes_fuel = true, driver_overnight_by = ''company'', commission = 40, price_gel = 160,
          updated_at = now(), driver_update_pending = true
    where id = %L and company_id = %L',
  (now() + interval '40 days 2 hours')::text, tests.p5('OPEN6'), tests.p5('C1'))), 1,
  'C1 the company edits every field of its open booking that the app edits, prices included');
select is((select (price_gel, client_price, commission, passengers, comment)::text from public.bookings where id = tests.p5('OPEN6')),
  '(160,200,40,3,edited)', 'C2 and the edit is saved');
select is(tests.try_sql(format('update public.bookings set driver_payout_gel = 120 where id = %L', tests.p5('OPEN6'))), 1,
  'C3 the company sets the driver''s pay while the booking is open');
select is(tests.try_sql(format(
  'update public.bookings set comment = ''new time'', client_price = 210, commission = 45, price_gel = 165, passenger_phone = ''+995 555 111 111'',
          updated_at = now(), driver_update_pending = true where id = %L and company_id = %L', tests.p5('ACC6'), tests.p5('C1'))), 1,
  'C4 the company edits its booking a driver has taken, its price included');
select is(tests.try_sql(format(
  'update public.bookings set comment = ''running late'', passenger_phone = ''+995 555 222 222'', updated_at = now(), driver_update_pending = true
    where id = %L and company_id = %L', tests.p5('RUN'), tests.p5('C1'))), 1,
  'C5 the company edits a trip on the road (the app warns first)');
select is(tests.try_sql(format('update public.bookings set driver_update_pending = false where id = %L', tests.p5('ACC6'))), 1,
  'C6 the company clears the "updated" flag when nothing changed');
select is(tests.try_sql(format('update public.bookings set pickup_sign_logo_url = ''https://files.example/new.pdf'' where id = %L', tests.p5('ACC6'))), 1,
  'C7 the company replaces the pickup-sign file');

-- C2 creating bookings, with or without a driver, and a convoy
select is(tests.try_sql(format(
  'insert into public.bookings (id, company_id, voucher_code, company_name, booking_type, from_location, from_location_type, to_location, to_location_type,
                                date_display, passengers, vehicle_type, vehicle_class, flight_number, meet_greet, sign_text, hotel, passenger_name,
                                passenger_phone, flight_direction, pickup_time, client_price, price_includes_fuel, driver_overnight_by, commission,
                                comment, payment_method, price_gel, created_by_name, status, driver_id, vehicle_id, required_languages,
                                requested_driver_category, kind, route)
   values (%L, %L, ''V-NEW1'', ''Test Tours C1'', ''transfer'', ''Tbilisi airport'', ''airport'', ''Tbilisi'', ''hotel'', %L, 2, ''sedan'', ''comfort'',
           ''TK 382'', true, ''Mr Test'', ''Test hotel'', ''Test Tourist'', ''+995 555 000 000'', ''arrival'', ''10:00'', 150, false, ''company'',
           20, ''-'', ''cash'', 130, ''Operator'', ''pending'', null, null, ''{en}'', ''all'', ''transfer'', ''"Tbilisi airport - Tbilisi"'')',
  tests.p5('NEW1'), tests.p5('C1'), (now() + interval '54 days')::text)), 1,
  'C8 the company creates a booking with the app''s full field list');
select is(tests.try_sql(format(
  'insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers,
                                driver_id, vehicle_id, price_gel)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, %L, %L, 100)',
  tests.p5('NEW2'), tests.p5('C1'), (now() + interval '55 days')::text, tests.p5('E1'), tests.p5('vE1'))), 1,
  'C9 the company creates a booking given straight to an approved driver with his vehicle');
select is(tests.try_sql(format(
  'insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers,
                                reminder_24h_sent, reassign_count, payment_status, is_emergency_replacement, driver_update_pending)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, false, 0, ''unpaid'', false, false)',
  tests.p5('NEW3'), tests.p5('C1'), (now() + interval '56 days')::text)), 1,
  'C10 a new booking may spell out the empty server fields');
select is(tests.try_sql(format(
  'insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers,
                                is_group_master, group_code, comment)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 6, true, ''CV-TEST'', ''convoy'')',
  tests.p5('CVM'), tests.p5('C1'), (now() + interval '57 days')::text)), 1,
  'C11 the company creates a convoy');
select is(tests.try_sql(format(
  'insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers,
                                parent_booking_id, leg_index, group_code, comment)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 3, %L, %s, ''CV-TEST'', ''car'')',
  tests.p5('CVL' || i), tests.p5('C1'), (now() + interval '57 days')::text, tests.p5('CVM'), i)), 1,
  'C12 and its car ' || i)
  from generate_series(1, 2) i;
select is(tests.try_sql(format(
  'insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers,
                                parent_booking_id, leg_index, group_code, driver_id, vehicle_id)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 3, %L, 3, ''CV-TEST'', %L, %L)',
  tests.p5('CVL3'), tests.p5('C1'), (now() + interval '57 days')::text, tests.p5('CVM'), tests.p5('E3'), tests.p5('vE3'))), 1,
  'C13 and a car given straight to an approved driver');

-- C3 the convoy edit and its sync to the cars
select is(tests.try_sql(format('update public.bookings set from_location = ''Mtskheta'', comment = ''convoy edited'', updated_at = now(), driver_update_pending = true where id = %L',
                               tests.p5('CVM'))), 1,
  'C14 the company edits its convoy');
select is(tests.try_sql(format('update public.bookings set from_location = ''Mtskheta'', comment = ''CV-TEST 1/3 convoy edited'', driver_update_pending = true, updated_at = now() where id = %L and company_id = %L',
                               tests.p5('CVL1'), tests.p5('C1'))), 1,
  'C15 and the app copies the change to each car');

-- C4 drivers: given to a convoy car, the emergency replacement, taken off again
select is(tests.try_sql(format('update public.bookings set driver_id = %L, vehicle_id = %L, updated_at = now() where id = %L and company_id = %L and status = ''pending''',
                               tests.p5('E2'), tests.p5('vE2'), tests.p5('CVL2'), tests.p5('C1'))), 1,
  'C16 the company gives a convoy car to an approved driver');
select is(tests.try_sql(format(
  'update public.bookings set driver_id = %L, status = ''pending'', driver_display_name = ''Test E3'', driver_phone = ''+995 500 000 003'',
          driver_plate = ''TEST-vE3'', vehicle_id = %L, is_emergency_replacement = true, updated_at = now()
    where id = %L and company_id = %L and status = ''pending''',
  tests.p5('E3'), tests.p5('vE3'), tests.p5('OFFER6'), tests.p5('C1'))), 1,
  'C17 the company''s emergency replacement on an open booking');
select is(tests.try_sql(format(
  'update public.bookings set driver_id = null, vehicle_id = null, driver_display_name = null, driver_phone = null, driver_plate = null where id = %L',
  tests.p5('OFFER7'))), 1,
  'C18 the company takes the driver off an open booking');
select is(tests.try_sql(format('update public.bookings set driver_id = %L, vehicle_id = %L where id = %L',
                               tests.p5('E3'), tests.p5('vE3'), tests.p5('OFFER7'))), 1,
  'C19 and offers it to another approved driver');
select tests.act_as_owner();

-- C5 cancelling: the app's direct update, the server's cancellation, the driver's
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L and company_id = %L and status = ''pending''',
                               tests.p5('PEND6'), tests.p5('C1'))), 1,
  'C20 the company cancels its open booking the old way (direct update)');
select is(public.cancel_booking_by_company(tests.p5('ACC6'), 'test') ->> 'code', 'cancelled',
  'C21 the company cancels a booking a driver has taken (the server''s cancellation)');
select tests.act_as(tests.p5('E1'));
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('ACC7'))), 1,
  'C22 the driver cancels his accepted booking');
select tests.act_as_owner();
select is((select string_agg(coalesce(cancelled_by, '-'), ',' order by voucher_code) from public.bookings
            where id in (tests.p5('PEND6'), tests.p5('ACC6'), tests.p5('ACC7'))), 'company,driver,company',
  'C23 and each cancellation names who made it');

-- C6 a trip from acceptance to payment
select tests.act_as(tests.p5('E2'));
select is(public.accept_booking_atomic(tests.p5('OPEN7'), tests.p5('E2'), tests.p5('vE2')) ->> 'code', 'accepted',
  'C24 an approved driver takes an open booking (the server''s acceptance)');
select is(tests.try_sql(format('update public.bookings set status = ''in_progress'' where id = %L and (status = ''accepted'' or status = ''confirmed'')', tests.p5('OPEN7'))), 1,
  'C25 he starts the trip');
select is(tests.try_sql(format('update public.bookings set odometer_start_photo_url = ''https://files.example/o1.jpg'', odometer_start_at = now() where id = %L and driver_id = %L',
                               tests.p5('OPEN7'), tests.p5('E2'))), 1,
  'C26 records the odometer');
select is(tests.try_sql(format('update public.bookings set status = ''completed'' where id = %L and status = ''in_progress''', tests.p5('OPEN7'))), 1,
  'C27 completes the trip');
select is(tests.try_sql(format('update public.bookings set odometer_end_photo_url = ''https://files.example/o2.jpg'', odometer_end_at = now() where id = %L and driver_id = %L',
                               tests.p5('OPEN7'), tests.p5('E2'))), 1,
  'C28 records the final odometer');
select is(tests.try_sql(format('update public.bookings set payment_status = ''paid'', payment_confirmed_at = now(), payment_confirmed_by = %L
                                 where id = %L and status = ''completed'' and driver_id = %L and payment_status is distinct from ''paid''',
                               tests.p5('E2'), tests.p5('OPEN7'), tests.p5('E2'))), 1,
  'C29 and confirms he was paid');
select tests.act_as_owner();
select ok((select completed_at is not null and payment_status = 'paid' from public.bookings where id = tests.p5('OPEN7')),
  'C30 the completion is stamped and the payment recorded');

-- C7 the server and the admin are not limited by P0-6
select is(tests.try_sql(format('update public.bookings set reminder_1h_sent = true, reminder_1h_sent_at = now(), reassign_count = reassign_count + 1 where id = %L',
                               tests.p5('ACC'))), 1,
  'C31 the server''s own jobs write the server fields');
select tests.act_as(tests.p5('ADM'));
select is(tests.try_sql(format('update public.bookings set price_gel = 155, driver_payout_gel = 120 where id = %L', tests.p5('DONE'))), 1,
  'C32 an admin corrects the money of a finished trip');
select tests.act_as_owner();

-- C8 cancelling a whole convoy the app's way: open cars first, then the convoy row
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'', updated_at = now() where id = %L and company_id = %L and status = ''pending''',
                               tests.p5('CVL1'), tests.p5('C1'))), 1,
  'C33 the company cancels an open car of its convoy');
select is(public.cancel_booking_by_company(tests.p5('CVL3'), 'test') ->> 'code', 'cancelled',
  'C34 and the car given to a driver (the server''s cancellation)');
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'', updated_at = now() where id = %L and company_id = %L and status <> ''completed''',
                               tests.p5('CVM'), tests.p5('C1'))), 1,
  'C35 and then the convoy row itself');
select tests.act_as_owner();

-- C9 the company still cannot do what P0-3 and P0-5 forbid (nothing loosened)
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''completed'' where id = %L', tests.p5('ACC'))), -1,
  'C36 the company still cannot complete a trip itself (P0-3)');
select is(tests.try_sql(format('update public.bookings set status = ''pending'' where id = %L', tests.p5('CNL'))), -1,
  'C37 nor revive a cancelled booking (P0-5)');
select tests.act_as_owner();

select * from finish();
rollback;
