-- P0-2 tests: the reminder worker replaces an unconfirmed driver at most
-- once, never touches started or finished trips, and alerts instead of
-- swapping again. Run AFTER supabase/migrations/20261031150000_reminder_reassign_once.sql
-- on a throwaway database built from fixtures/ (see README.md). One
-- transaction, rolled back. now() is fixed inside it: calling
-- run_booking_reminders() again is "the next cron minute" in the same window;
-- tests.advance(n) makes n minutes go by.
\set ON_ERROR_STOP 1
begin;
select plan(47);
\ir fixtures/p0_2_seed.sql
create temp table snap (k text primary key, v uuid);

-- calendar protection inside the swap helper ---------------------------------
select is(public.reassign_booking_to_driver(tests.r_id('RNONE'), tests.r_id('A'), tests.v_id('A'), 'Driver A', null, null), false,
  'calendar: a swap that collides with the new driver''s calendar is refused');
select is((select count(*)::int from public.driver_schedules where booking_id = tests.r_id('RNONE') and driver_id = tests.r_id('F')), 1,
  'calendar: the refused swap leaves the current driver''s calendar block in place');

-- minute 1 --------------------------------------------------------------------
select public.run_booking_reminders() ->> 'ok';
insert into snap select 'R45 driver', driver_id from public.bookings where id = tests.r_id('R45');

-- unconfirmed driver approaching pickup (R45, 45 minutes)
select is(tests.notes(tests.r_id('A'), 'booking_reminder_final', tests.r_id('R45')), 1, 'R45: driver A gets the final 45-minute reminder');
select is((select reassign_count from public.bookings where id = tests.r_id('R45')), 1, 'R45: A is replaced once');
select ok((select driver_id in (tests.r_id('B'), tests.r_id('C')) and status = 'accepted' from public.bookings where id = tests.r_id('R45')),
  'R45: the job is now accepted by a free comfort driver (B or C)');
select ok((select auto_reassigned_at is not null from public.bookings where id = tests.r_id('R45')), 'R45: the replacement time is recorded');
select is((select count(*)::int from public.driver_schedules where booking_id = tests.r_id('R45')), 1, 'R45: exactly one calendar block for the job');
select is((select driver_id from public.driver_schedules where booking_id = tests.r_id('R45')), (select v from snap where k = 'R45 driver'),
  'R45: the calendar block belongs to the new driver');
select is(tests.notes(tests.r_id('A'), 'booking_taken_away', tests.r_id('R45')), 1, 'R45: A is told the job was given to someone else');
select is(tests.notes((select v from snap where k = 'R45 driver'), 'booking_reassigned', tests.r_id('R45')), 1, 'R45: the new driver is asked to confirm');
select is(tests.notes(tests.r_id('company'), 'booking_auto_reassigned', tests.r_id('R45')), 1, 'R45: the company is told the driver changed');

-- 3-hour escalation with a free replacement (RESC, 140 minutes)
select is((select reassign_count from public.bookings where id = tests.r_id('RESC')), 1, 'RESC: unanswered 3-hour ask -> replaced once');
select is((select driver_id from public.bookings where id = tests.r_id('RESC')), tests.r_id('H'), 'RESC: the free business driver H takes it');
select is(tests.notes(tests.r_id('G'), 'booking_taken_away', tests.r_id('RESC')), 1, 'RESC: G is told the job was given to someone else');

-- no replacement available
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('RNONE')), 1, 'RNONE: no free driver at 45 minutes -> company alerted');
select ok((select body like '%თავისუფალი მძღოლი ვერ მოიძებნა%' from public.notifications
            where type = 'booking_driver_unconfirmed' and data ->> 'bookingId' = tests.r_id('RNONE')::text), 'RNONE: with the existing wording');
select ok((select driver_id = tests.r_id('F') and reassign_count = 0 from public.bookings where id = tests.r_id('RNONE')), 'RNONE: F stays the driver');
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('RNOESC')), 1, 'RNOESC: no free driver at the 3-hour escalation -> company alerted');
select ok((select driver_id = tests.r_id('2') and reassign_count = 0 from public.bookings where id = tests.r_id('RNOESC')), 'RNOESC: F2 stays the driver');

-- started and finished trips
select ok((select status = 'in_progress' and driver_id = tests.r_id('D') and reassign_count = 0 from public.bookings where id = tests.r_id('RIP')),
  'RIP: a trip in progress is never reassigned');
select is((select count(*)::int from public.notifications where data ->> 'bookingId' = tests.r_id('RIP')::text and type <> 'booking_reminder_12h'), 0,
  'RIP: and nobody is asked to confirm it');
select ok((select status = 'completed' and driver_id = tests.r_id('E') from public.bookings where id = tests.r_id('RDONE')), 'RDONE: a completed booking is untouched');
select ok((select status = 'cancelled' from public.bookings where id = tests.r_id('RCANC')), 'RCANC: a cancelled booking is untouched');
select is((select count(*)::int from public.notifications where user_id in (tests.r_id('J'), tests.r_id('K'))), 0,
  'the candidates for those trips (J, K) were never contacted');

-- minutes 2-6, still inside the same windows ---------------------------------
select public.run_booking_reminders() ->> 'ok';
select public.run_booking_reminders() ->> 'ok';
select public.run_booking_reminders() ->> 'ok';
select public.run_booking_reminders() ->> 'ok';
select public.run_booking_reminders() ->> 'ok';
select is((select reassign_count from public.bookings where id = tests.r_id('R45')), 1, 'repeat runs: R45 is still replaced only once');
select is((select driver_id from public.bookings where id = tests.r_id('R45')), (select v from snap where k = 'R45 driver'), 'repeat runs: same replacement driver');
select is((select count(*)::int from public.notifications where type in ('booking_reassigned', 'booking_auto_reassigned', 'booking_taken_away')
            and data ->> 'bookingId' = tests.r_id('R45')::text), 3, 'repeat runs: no new swap notices for R45 (still 3)');
select is(tests.notes((select v from snap where k = 'R45 driver'), 'booking_reminder_final', tests.r_id('R45')), 0,
  'quiet period: the replacement is not pushed again');
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('R45')), 0, 'quiet period: no alert yet');
select is((select reassign_count from public.bookings where id = tests.r_id('RESC')), 1, 'repeat runs: RESC is still replaced only once');
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('RNONE')), 1, 'repeat runs: RNONE alert not repeated');
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('RNOESC')), 1, 'repeat runs: RNOESC alert not repeated');
select is((select status from public.bookings where id = tests.r_id('RIP')), 'in_progress', 'repeat runs: RIP still in progress');

-- 11 minutes later: the R45 replacement is still silent ----------------------
select tests.advance(11);
select public.run_booking_reminders() ->> 'ok';
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('R45')), 1,
  'after the quiet period: the company is told the replacement has not confirmed');
select ok((select body like '%შემცვლელმა მძღოლმა%' from public.notifications
            where type = 'booking_driver_unconfirmed' and data ->> 'bookingId' = tests.r_id('R45')::text), 'after the quiet period: the alert names the replacement');
select public.run_booking_reminders() ->> 'ok';
select public.run_booking_reminders() ->> 'ok';
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('R45')), 1, 'after the quiet period: told once, not every minute');
select ok((select reassign_count = 1 and driver_id = (select v from snap where k = 'R45 driver') from public.bookings where id = tests.r_id('R45')),
  'after the quiet period: still no second swap');

-- the RESC replacement confirms; 85 minutes later (44 min before pickup) it reaches the 45-minute stage
select tests.act_as(tests.r_id('H'));
select is(public.confirm_booking_as_driver(tests.r_id('RESC')) ->> 'code', 'confirmed', 'RESC: replacement H confirms');
select tests.act_as_owner();
select tests.advance(85);
select public.run_booking_reminders() ->> 'ok';
select is(tests.notes(tests.r_id('H'), 'booking_reminder_final', tests.r_id('RESC')), 0, 'RESC: a confirmed replacement gets no final reminder');
select ok((select driver_id = tests.r_id('H') and reassign_count = 1 from public.bookings where id = tests.r_id('RESC')), 'RESC: H keeps the job');
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('RESC')), 0, 'RESC: no alert for a confirmed job');

-- RNOESC at its 45-minute stage: F2 still silent, alert already sent
select ok((select body like '%გთხოვ დაადასტურე ახლავე%' and body not like '%სხვას გადაეცემა%' from public.notifications
            where user_id = tests.r_id('2') and type = 'booking_reminder_final' and data ->> 'bookingId' = tests.r_id('RNOESC')::text),
  'RNOESC: the final reminder no longer threatens a swap that cannot happen');
select ok((select driver_id = tests.r_id('2') and reassign_count = 0 from public.bookings where id = tests.r_id('RNOESC')), 'RNOESC: still no swap at 45 minutes');
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('RNOESC')), 1, 'RNOESC: and no second alert');

-- the swap helper refuses on its own, whatever calls it ----------------------
select is(public.reassign_booking_to_driver(tests.r_id('RESC'), tests.r_id('G'), tests.v_id('G'), 'Driver G', null, null), false,
  'helper: refuses a booking whose driver has confirmed');
select is(public.reassign_booking_to_driver(tests.r_id('RIP'), tests.r_id('J'), tests.v_id('J'), 'Driver J', null, null), false,
  'helper: refuses a trip in progress');
select is(public.reassign_booking_to_driver(tests.r_id('R45'), tests.r_id('A'), tests.v_id('A'), 'Driver A', null, null), false,
  'helper: refuses a second swap of the same booking');

select * from finish();
rollback;
