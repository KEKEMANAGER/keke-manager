-- P0-3 reproduction. Every check is phrased as "the problem is there"
-- (prefix BUG:). On the database as P0-1 and P0-2 leave it, all 22 hold.
-- After part A, only the three part-B items hold (an approved driver who has
-- not got the job still reads its passenger details through the table).
-- After part B, none hold. Runs in one transaction that is rolled back.
begin;
\i fixtures/p0_3_seed.sql
select plan(22);

-- Reading an open job (and an offer) in full through the table -------------
select tests.act_as(tests.p3('U'));
select ok((select count(*) from public.bookings where id = tests.p3('P1') and passenger_phone is not null) = 1,
  'BUG: a driver who is not approved yet reads the passenger phone of an open job');
select ok((select count(*) from public.booking_history where booking_id = tests.p3('TU')) = 1,
  'BUG: a driver who is not approved yet reads the change log of a job offered to him');
select tests.act_as(tests.p3('R'));
select ok((select count(*) from public.bookings where id = tests.p3('P1') and passenger_phone is not null) = 1,
  'BUG: a rejected driver reads the passenger phone of an open job');
select tests.act_as(tests.p3('BL'));
select ok((select count(*) from public.bookings where id = tests.p3('P1') and passenger_phone is not null) = 1,
  'BUG: a blocked driver reads the passenger phone of an open job');
select tests.act_as(tests.p3('NV'));
select ok((select count(*) from public.bookings where id = tests.p3('P1') and passenger_phone is not null) = 1,
  'BUG: an approved driver without an approved car reads the passenger phone of an open job');
select tests.act_as(tests.p3('E1'));
select ok((select count(*) from public.bookings where id = tests.p3('P1') and passenger_phone is not null) = 1,
  'BUG: (part B) an approved driver who has not got the job reads its passenger phone');
select ok((select count(*) from public.bookings where id = tests.p3('TE') and passenger_phone is not null) = 1,
  'BUG: (part B) an approved driver reads the passenger phone of an offer he has not accepted');
select ok((select count(*) from public.booking_history where booking_id = tests.p3('TE')) = 1,
  'BUG: (part B) an approved driver reads the change log of an offer he has not accepted');

-- Pickup-sign files ----------------------------------------------------------
select tests.act_as_anon();
select ok((select count(*) from storage.objects where bucket_id = 'booking-pickup-signs') = 3,
  'BUG: anyone with the public key lists every pickup-sign file');
select tests.act_as(tests.p3('E1'));
select ok((select count(*) from storage.objects
            where bucket_id = 'booking-pickup-signs' and name like '%' || tests.p3('AE2')::text || '%') = 1,
  'BUG: a driver lists the pickup-sign file of another driver''s job');

-- Taking jobs through accept_booking_atomic ----------------------------------
select tests.act_as(tests.p3('U'));
select ok(public.accept_booking_atomic(tests.p3('P4'), tests.p3('U'), tests.p3('vU')) ->> 'code' = 'accepted',
  'BUG: a driver who is not approved yet takes an open job');
select tests.act_as(tests.p3('BL'));
select ok(public.accept_booking_atomic(tests.p3('P5'), tests.p3('BL'), tests.p3('vBL')) ->> 'code' = 'accepted',
  'BUG: a blocked driver takes an open job');
select tests.act_as(tests.p3('NV'));
select ok(public.accept_booking_atomic(tests.p3('P7'), tests.p3('NV')) ->> 'code' = 'accepted',
  'BUG: an approved driver without an approved car takes an open job');
select tests.act_as(tests.p3('E1'));
select ok(public.accept_booking_atomic(tests.p3('P6'), tests.p3('E1'), tests.p3('vE2')) ->> 'code' = 'accepted',
  'BUG: a driver takes a job with another driver''s car');

-- Direct table writes ----------------------------------------------------------
select tests.act_as(tests.p3('E3'));
select ok(tests.try_sql(format($$update public.bookings set driver_id = %L, status = 'accepted'
                                  where id = %L and status = 'pending'$$, tests.p3('E3'), tests.p3('P3'))) = 1,
  'BUG: a driver takes an open job with a plain UPDATE (no calendar check)');
select tests.act_as(tests.p3('E1'));
select ok(tests.try_sql(format($$update public.bookings set status = 'accepted' where id = %L$$, tests.p3('TE'))) = 1,
  'BUG: a driver accepts an offer with a plain UPDATE (no calendar check)');
select tests.act_as(tests.p3('E2'));
select ok(tests.try_sql(format($$update public.bookings set price_gel = 1500 where id = %L$$, tests.p3('AE2'))) = 1,
  'BUG: the assigned driver rewrites the company''s price');
select tests.act_as(tests.p3('C1'));
select ok(tests.try_sql(format($$update public.bookings set driver_id = %L, status = 'accepted' where id = %L$$,
                               tests.p3('U'), tests.p3('P2'))) = 1,
  'BUG: a company puts a driver who is not approved on a job with a plain UPDATE');
select tests.act_as(tests.p3('PV'));
select ok(tests.try_sql(format($$update public.vehicles set verification_status = 'approved', is_verified = true
                                  where id = %L$$, tests.p3('vPV'))) = 1,
  'BUG: a driver marks his own car approved');
select tests.act_as(tests.p3('BL'));
select ok(tests.try_sql(format($$update public.users set is_blocked = false where id = %L$$, tests.p3('BL'))) = 1,
  'BUG: a blocked driver lifts his own block');

-- Automatic replacement --------------------------------------------------------
select tests.act_as_owner();
select public.run_booking_reminders();
select ok((select driver_id from public.bookings where id = tests.p3('REPD')) = tests.p3('ED1'),
  'BUG: the replacement search gives a job to the driver who declined it');
select ok((select driver_id from public.bookings where id = tests.p3('REPV')) = tests.p3('PVA'),
  'BUG: the replacement search gives a job to a driver whose car is not approved');

select * from finish();
rollback;
