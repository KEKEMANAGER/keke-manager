-- P0-6 reproduction: each "BUG:" check passes while that problem exists. On
-- the state P0-6 builds on (P0-1 .. P0-5) all 12 hold; after P0-6 none does.
-- Separate accounts: companies C1 and C2, approved drivers E1 E2, a driver
-- KEKE has not approved (U6). One transaction, rolled back.
begin;
select plan(12);
\ir fixtures/p0_5_seed.sql

-- a driver who signed up but is not approved, with an approved vehicle of his own
insert into auth.users (id, email) values (tests.p5('U6'), 'p06-u6@test.invalid');
insert into public.users (id, role, full_name, email, is_verified, verification_status, is_available)
values (tests.p5('U6'), 'driver', 'Test U6', 'p06-u6@test.invalid', false, 'pending', true);
insert into public.vehicles (id, driver_id, type, class, model, plate, verification_status, is_verified, is_active)
values (tests.p5('vU6'), tests.p5('U6'), 'sedan', 'comfort', 'Test model', 'TEST-vU6', 'approved', true, true);
-- C2's own open booking
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, price_gel,
                             vehicle_type, vehicle_class, passengers, voucher_code)
values (tests.p5('C2OPEN'), tests.p5('C2'), 'transfer', 'pending', (now() + interval '19 days')::text,
        'Test airport', 'Test hotel', 120, 'sedan', 'comfort', 1, 'V-C2OPEN');

select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'bookings'
                    and cmd = 'UPDATE' and btrim(coalesce(with_check, '')) = 'true'),
  'BUG: an UPDATE policy on bookings accepts any new row (with check (true)), which switches the other checks off');

select tests.act_as(tests.p5('C2'));
select tests.try_sql(format('update public.bookings set driver_id = %L, parent_booking_id = %L, leg_index = 9 where id = %L',
                            tests.p5('C2'), tests.p5('MST'), tests.p5('C2OPEN')));
select tests.act_as_owner();
select ok(exists (select 1 from public.bookings where id = tests.p5('C2OPEN') and parent_booking_id = tests.p5('MST')
                    and driver_id = tests.p5('C2')),
  'BUG: company C2 hangs its booking, with itself as the driver, under company C1''s convoy (and joins it)');

select tests.act_as(tests.p5('C2'));
select ok(tests.try_sql(format(
  'insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, parent_booking_id, leg_index)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, %L, 8)',
  tests.p5('C2LEG'), tests.p5('C2'), (now() + interval '16 days')::text, tests.p5('MST'))) = 1,
  'BUG: company C2 creates a booking directly inside company C1''s convoy');

select tests.act_as(tests.p5('C1'));
select ok(tests.try_sql(format('update public.bookings set driver_id = %L where id = %L', tests.p5('U6'), tests.p5('OPEN'))) = 1,
  'BUG: a company puts a driver KEKE has not approved on its booking (he then sees the passenger''s details)');
select tests.try_sql(format('update public.bookings set driver_id = null where id = %L', tests.p5('OPEN')));
select ok(tests.try_sql(format('update public.bookings set driver_id = %L where id = %L', tests.p5('C1'), tests.p5('OPEN'))) = 1,
  'BUG: a company names itself the driver of its booking');
select tests.try_sql(format('update public.bookings set driver_id = null where id = %L', tests.p5('OPEN')));
select ok(tests.try_sql(format('update public.bookings set driver_id = %L, vehicle_id = %L where id = %L',
                               tests.p5('E2'), tests.p5('vE1'), tests.p5('OPEN'))) = 1,
  'BUG: a company puts a driver on its booking with another driver''s vehicle');

select ok(tests.try_sql(format('update public.bookings set price_gel = 1, driver_payout_gel = 0 where id = %L', tests.p5('DONE'))) = 1,
  'BUG: a company rewrites the price and the driver''s pay of a completed trip');
select ok(tests.try_sql(format('update public.bookings set driver_payout_gel = 1 where id = %L', tests.p5('ACC'))) = 1,
  'BUG: a company cuts the driver''s pay after he took the job');
select ok(tests.try_sql(format('update public.bookings set reminder_1h_sent = true, dispatch_wave2_due_at = now(), reassign_count = 7 where id = %L',
                               tests.p5('ACC'))) = 1,
  'BUG: a company writes the server''s reminder, dispatch and reassignment fields');
select ok(tests.try_sql(format('update public.bookings set completed_at = now() - interval ''3 days'', odometer_end_at = now() where id = %L',
                               tests.p5('DONE'))) = 1,
  'BUG: a company backdates a completion and rewrites the driver''s odometer record');
select ok(tests.try_sql(format('update public.bookings set parent_booking_id = null where id = %L', tests.p5('LEG2'))) = 1,
  'BUG: a company pulls a car out of a convoy after the convoy was created');
select ok(tests.try_sql(format(
  'insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, reminder_24h_sent, completed_at, payment_status)
   values (%L, %L, ''transfer'', ''pending'', %L, ''x'', ''y'', ''sedan'', ''comfort'', 1, true, now(), ''paid'')',
  tests.p5('PRESET'), tests.p5('C1'), (now() + interval '17 days')::text)) = 1,
  'BUG: a new booking can be created with the server''s fields already set (reminder sent, completed, paid)');
select tests.act_as_owner();

select * from finish();
rollback;
