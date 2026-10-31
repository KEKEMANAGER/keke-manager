-- P0-2 bug reproduction, run on the production snapshot BEFORE the fix.
-- The checks marked BUG pass while the bug exists and fail once it is fixed.
\set ON_ERROR_STOP 1
begin;
select plan(10);
\ir fixtures/p0_2_seed.sql

-- calendar: a replacement that collides with the new driver's calendar
-- fails, but the current driver's calendar block is already gone
select is(public.reassign_booking_to_driver(tests.r_id('RNONE'), tests.r_id('A'), tests.v_id('A'), 'Driver A', null, null), false,
  'a replacement that collides with the new driver''s calendar is refused');
select is((select count(*)::int from public.driver_schedules where booking_id = tests.r_id('RNONE') and driver_id = tests.r_id('F')), 0,
  'BUG: the refused replacement still deleted the current driver''s calendar block');

-- minute 1
select public.run_booking_reminders();
select is((select reassign_count from public.bookings where id = tests.r_id('R45')), 1, 'minute 1: unconfirmed driver A is replaced (by design)');
select is(tests.notes(tests.r_id('A'), 'booking_taken_away', tests.r_id('R45')), 0,
  'BUG: at the 45-minute stage driver A is never told the job was taken away');
select ok((select status = 'accepted' and driver_id <> tests.r_id('D') from public.bookings where id = tests.r_id('RIP')),
  'BUG: a trip already in progress is put back to accepted with another driver');

-- minutes 2 and 3, same 45-minute window
select public.run_booking_reminders();
select public.run_booking_reminders();
select is((select reassign_count from public.bookings where id = tests.r_id('R45')), 3,
  'BUG: three automatic replacements in three runs');
select is((select count(*)::int from public.notifications where type = 'booking_auto_reassigned' and data ->> 'bookingId' = tests.r_id('R45')::text), 3,
  'BUG: the company is told three times that the driver changed');
select is((select count(*)::int from public.notifications where type = 'booking_reassigned' and data ->> 'bookingId' = tests.r_id('R45')::text), 3,
  'BUG: three different "urgent, this job is yours" pushes');

-- no replacement at the 3-hour escalation: nobody is told
select is(tests.notes(tests.r_id('company'), 'booking_driver_unconfirmed', tests.r_id('RNOESC')), 0,
  'BUG: no replacement found at the 3-hour escalation and the company is not told');
select is((select status from public.bookings where id = tests.r_id('RDONE')), 'completed', 'completed bookings are left alone (already true)');

select * from finish();
rollback;
