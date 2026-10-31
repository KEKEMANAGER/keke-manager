-- P0-1 bug reproduction, run on the production snapshot BEFORE the fix.
-- Every check passes while the bug exists and fails once it is fixed, so the
-- same file is the "before" proof and, run after the fix, the "after" proof.
\set ON_ERROR_STOP 1
begin;
select plan(6);
\ir fixtures/p0_1_seed.sql

select tests.act_as(tests.id('A'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 1, 'driver A sees open booking O1');
select tests.act_as(tests.id('B'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 1, 'driver B sees open booking O1');

select tests.act_as(tests.id('A'));
select is(public.reject_pending_booking_as_driver(tests.id('O1')), true, 'driver A declines O1');

select tests.act_as_owner();
select is((select status from public.bookings where id = tests.id('O1')), 'rejected', 'BUG: one driver''s decline set the whole booking to rejected');
select tests.act_as(tests.id('B'));
select is((select count(*)::int from public.bookings where id = tests.id('O1')), 0, 'BUG: driver B can no longer see O1');
select tests.act_as_owner();
select is((select count(*)::int from public.booking_emails where booking_id = tests.id('O1') and event = 'rejected'), 1, 'BUG: the company is emailed that O1 was rejected');


select tests.act_as_owner();
select * from finish();
rollback;
