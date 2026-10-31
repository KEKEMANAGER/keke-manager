-- P0-1 tests: a driver's "Decline" on an open booking affects only that driver.
-- Run AFTER supabase/migrations/20261031120000_driver_decline_per_driver.sql on a
-- throwaway database built from fixtures/ (see README.md). Everything happens
-- in one transaction that is rolled back.
--
-- Numbers in the descriptions follow the Phase 1 test list:
--  1 broadcast to three drivers   2 A declines   3 booking stays open
--  4 B and C still see it   5 B accepts   6 A cannot reject it for everyone
--  7 duplicate declines   8 one winner (sequential part; the real race is in
--  p0_1_concurrency.sh)   9 calendar conflicts still refused
--  10 passenger details   + extra cases for targeted offers and privacy.
\set ON_ERROR_STOP 1
begin;
select plan(52);
\ir fixtures/p0_1_seed.sql

-- setup: driver B already has job X on 5 Dec 10:00-12:00 (through the real accept path)
select tests.act_as(tests.id('B'));
select is(public.accept_booking_atomic(tests.id('X'), tests.id('B'), tests.id('vB')) ->> 'code', 'accepted', 'setup: B holds job X on 5 Dec 10:00-12:00');

-- 1. the open booking reaches all three drivers
select tests.act_as(tests.id('A'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 1, '1. driver A sees open booking O1');
select tests.act_as(tests.id('B'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 1, '1. driver B sees open booking O1');
select tests.act_as(tests.id('C'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 1, '1. driver C sees open booking O1');

-- 2. driver A declines
select tests.act_as(tests.id('A'));
select is(public.reject_pending_booking_as_driver(tests.id('O1')), true, '2. driver A declines O1');

-- 3. the booking stays open
select tests.act_as_owner();
select is((select status from public.bookings where id = tests.id('O1')), 'pending', '3. O1 is still pending');
select ok((select driver_id is null from public.bookings where id = tests.id('O1')), '3. O1 still has no driver');
select is((select count(*)::int from public.booking_driver_declines where booking_id = tests.id('O1')), 1, '3. exactly one decline is recorded for O1');
select is((select count(*)::int from public.booking_emails where booking_id = tests.id('O1') and event = 'rejected'), 0, '3. the company gets no "rejected" email for O1');

-- 4. B and C still see it; A no longer does
select tests.act_as(tests.id('B'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 1, '4. driver B still sees O1');
select tests.act_as(tests.id('C'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 1, '4. driver C still sees O1');
select tests.act_as(tests.id('A'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 0, '4. driver A no longer sees O1');
select is((select count(*)::int from public.bookings where id = tests.id('O1') and passenger_phone is not null), 0, '10. after declining, driver A can no longer read O1''s passenger details');

-- 7 (rule). the decliner cannot take it back
select is(public.accept_booking_atomic(tests.id('O1'), tests.id('A'), tests.id('vA')) ->> 'code', 'declined', '7. driver A cannot accept O1 through the accept function');
select is(tests.try_direct_accept(tests.id('O1'), tests.id('A')), 0, '7. driver A cannot accept O1 by a direct update');
select tests.act_as_owner();
select ok((select status = 'pending' and driver_id is null from public.bookings where id = tests.id('O1')), '7. O1 is untouched by A''s attempts');

-- 5. driver B accepts
select tests.act_as(tests.id('B'));
select is(public.accept_booking_atomic(tests.id('O1'), tests.id('B'), tests.id('vB')) ->> 'code', 'accepted', '5. driver B accepts O1');
select tests.act_as_owner();
select ok((select status = 'accepted' and driver_id = tests.id('B') from public.bookings where id = tests.id('O1')), '5. O1 is accepted by B');
select is((select count(*)::int from public.driver_schedules where booking_id = tests.id('O1') and driver_id = tests.id('B')), 1, '5. B''s calendar is blocked for O1 (one row)');
select is((select count(*)::int from public.booking_emails where booking_id = tests.id('O1') and event = 'confirmed'), 1, '5. the company gets the usual "confirmed" email');

-- 6. A cannot reject it for everyone
select tests.act_as(tests.id('A'));
select is(public.reject_pending_booking_as_driver(tests.id('O1')), false, '6. a decline after B accepted changes nothing (returns false)');
select tests.act_as_owner();
select ok((select status = 'accepted' and driver_id = tests.id('B') from public.bookings where id = tests.id('O1')), '6. O1 is still accepted by B');
select tests.act_as(tests.id('A'));
select throws_ok($$ select tests.try_set_status(tests.id('O2'), 'rejected') $$, '42501', null, '6. a direct update of open O2 to "rejected" is refused');
select tests.act_as_owner();
select is((select status from public.bookings where id = tests.id('O2')), 'pending', '6. O2 is still pending');

-- 8. sequential part: a second driver cannot take an accepted job
select tests.act_as(tests.id('C'));
select is(public.accept_booking_atomic(tests.id('O1'), tests.id('C'), tests.id('vC')) ->> 'code', 'not_pending', '8. driver C cannot take O1 after B');
select tests.act_as_owner();
select is((select driver_id from public.bookings where id = tests.id('O1')), tests.id('B'), '8. O1 still has exactly driver B');

-- 7. duplicate declines
select tests.act_as(tests.id('A'));
select is(public.reject_pending_booking_as_driver(tests.id('O2')), true, '7. A declines O2');
select is(public.reject_pending_booking_as_driver(tests.id('O2')), true, '7. A declines O2 again (no error)');
select tests.act_as_owner();
select is((select count(*)::int from public.booking_driver_declines where booking_id = tests.id('O2') and driver_id = tests.id('A')), 1, '7. still one decline row for A on O2');
select ok((select status = 'pending' and driver_id is null from public.bookings where id = tests.id('O2')), '7. O2 is still open');
select tests.act_as(tests.id('B'));
select is((select count(*)::int from public.bookings where id = tests.id('O2')), 1, '7. driver B still sees O2');

-- 9. calendar conflicts are still refused
select tests.act_as(tests.id('B'));
select is(public.accept_booking_atomic(tests.id('O4'), tests.id('B'), tests.id('vB')) ->> 'code', 'driver_busy', '9. B cannot take O4 (11:00), he is busy with X until 12:00');
select tests.act_as_owner();
select ok((select status = 'pending' and driver_id is null from public.bookings where id = tests.id('O4')), '9. O4 stays open after the refused accept');
select tests.act_as(tests.id('C'));
select is(public.accept_booking_atomic(tests.id('O4'), tests.id('C'), tests.id('vC')) ->> 'code', 'accepted', '9. driver C, who is free, takes O4');

-- the company can still give a declined job to that driver on purpose
select tests.act_as(tests.id('A'));
select is(public.reject_pending_booking_as_driver(tests.id('O3')), true, 'company rule: A declines O3');
select tests.act_as(tests.id('company'));
select is(public.accept_booking_atomic(tests.id('O3'), tests.id('A'), tests.id('vA')) ->> 'code', 'accepted', 'company rule: the company assigns O3 to A anyway');

-- a job offered to one driver: declining it turns the offer down, as before
select tests.act_as(tests.id('A'));
select is(public.reject_pending_booking_as_driver(tests.id('T1')), true, 'targeted: A declines T1, offered to him alone');
select tests.act_as_owner();
select ok((select status = 'rejected' and driver_id is null from public.bookings where id = tests.id('T1')), 'targeted: T1 is rejected and has no driver (unchanged behaviour)');
select is((select count(*)::int from public.booking_emails where booking_id = tests.id('T1') and event = 'rejected'), 1, 'targeted: the company is emailed that T1 was turned down');
select tests.act_as(tests.id('A'));
select is(public.reject_pending_booking_as_driver(tests.id('T2')), false, 'targeted: A cannot decline T2, which is offered to B');
select tests.act_as_owner();
select ok((select status = 'pending' and driver_id = tests.id('B') from public.bookings where id = tests.id('T2')), 'targeted: T2 is untouched');

-- who may decline, and who sees declines
select tests.act_as(tests.id('company'));
select throws_ok($$ select public.reject_pending_booking_as_driver(tests.id('O2')) $$, '42501', 'driver only', 'only drivers can decline');
select tests.act_as_anon();
select throws_ok($$ select public.reject_pending_booking_as_driver(tests.id('O2')) $$, '42501', null, 'anonymous visitors cannot decline');
select tests.act_as(tests.id('A'));
select throws_ok($$ insert into public.booking_driver_declines (booking_id, driver_id) values (tests.id('O4'), tests.id('A')) $$, '42501', null, 'nobody writes decline rows directly');
select is((select count(*)::int from public.booking_driver_declines), 4, 'driver A sees his own 4 declines (O1, O2, O3, T1)');
select tests.act_as(tests.id('B'));
select is((select count(*)::int from public.booking_driver_declines), 0, 'driver B sees none of A''s declines');
select tests.act_as(tests.id('company'));
select is((select count(*)::int from public.booking_driver_declines), 0, 'the company sees no decline rows');

-- 10. passenger details before acceptance: KNOWN GAP, belongs to P0-3
select tests.act_as(tests.id('C'));
select todo('P0-3: open jobs still expose passenger details to every driver', 1);
select is((select count(*)::int from public.bookings where id = tests.id('O2') and passenger_phone is not null), 0, '10. a driver who has not accepted O2 cannot read its passenger phone');

-- Deliberate tampering through direct table updates: KNOWN GAP, P0-3 / P1-1.
-- (Last, because the unfiltered update rejects the remaining open jobs.)
select tests.act_as(tests.id('A'));
select is((select count(*)::int from public.bookings where id = tests.id('O2')), 0, 'tampering: A cannot even see O2, which he declined');
select todo('P0-3/P1-1: the direct-accept rule lets a driver match any open job he has not declined, and the other update rules'' checks (incl. WITH CHECK (true)) accept the changed row', 2);
select throws_ok($$ update public.bookings set status = 'rejected', driver_id = auth.uid() where id = tests.id('O5') $$, '42501', null, 'tampering: a driver cannot set open job O5 to rejected under his own name');
select throws_ok($$ update public.bookings set status = 'rejected' $$, '42501', null, 'tampering: a driver cannot reject every open job with one unfiltered update');
select tests.act_as_owner();
select is((select status from public.bookings where id = tests.id('O2')), 'pending', 'tampering: O2, which A declined, survives A''s unfiltered update');

select * from finish();
rollback;
