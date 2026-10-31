-- P0-5 reproduction: each "BUG:" check passes while that problem exists. On
-- the state P0-5 builds on (P0-1..P0-4) all 12 hold; after P0-5 none does.
-- The app side of the bug (cancel only on the two newest dashboard cards, and
-- only for pending bookings) is in app/(app)/dashboard.tsx and
-- lib/bookings.ts cancelBookingByCompany; this file covers the database.
-- One transaction, rolled back; nothing is sent anywhere.
begin;
select plan(12);
\ir fixtures/p0_5_seed.sql

select ok(not tests.p5_applied(),
  'BUG: the server has no cancellation a company can use for a booking a driver has accepted');

-- What an app's direct update does today when the company cancels ACC.
select tests.act_as(tests.p5('C1'));
update public.bookings set status = 'cancelled' where id = tests.p5('ACC');
select tests.act_as_owner();
select ok(tests.notices(tests.p5('E1'), 'booking_cancelled') = 0 and tests.pushes_to(tests.tok5('E1')) = 0,
  'BUG: the driver is not told that the company cancelled his booking');
select ok(tests.history_lines(tests.p5('ACC')) = 0,
  'BUG: the cancellation leaves no line in the booking''s change log');

select tests.act_as(tests.p5('C1'));
update public.bookings set status = 'cancelled' where id = tests.p5('OFFER');
update public.bookings set status = 'cancelled' where id = tests.p5('FLT');
select tests.act_as_owner();
select ok(tests.notices(tests.p5('E2'), 'booking_cancelled') = 0,
  'BUG: the driver a job was offered to is not told when the company withdraws it');
select ok(tests.notices(tests.p5('H'), 'booking_cancelled') + tests.notices(tests.p5('S'), 'booking_cancelled') = 0,
  'BUG: neither the fleet owner nor his driver is told when the company cancels their job');

select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('RUN'))), 1,
  'BUG: the company cancels a trip in progress with a direct update');
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('DONE'))), 1,
  'BUG: the company cancels a completed booking');
select is(tests.try_sql(format('update public.bookings set status = ''pending'' where id = %L', tests.p5('CNL'))), 1,
  'BUG: the company brings a cancelled booking back to pending');
select tests.act_as(tests.p5('E1'));
select is(public.accept_booking_atomic(tests.p5('CNL'), tests.p5('E1'), tests.p5('vE1')) ->> 'code', 'accepted',
  'BUG: ... and a driver then takes the booking that was cancelled');
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''rejected'' where id = %L', tests.p5('LEG3'))), 1,
  'BUG: the company quietly stops a car on the road by marking its booking ''rejected''');
select is(tests.try_sql(format('update public.bookings set status = ''pending'' where id = %L', tests.p5('ACC2'))), 1,
  'BUG: the company takes back a job its driver accepted by setting it to pending; nobody is told');
select tests.try_sql(format('update public.bookings set status = ''cancelled'', cancelled_by = ''driver'' where id = %L', tests.p5('ACC2')));
select tests.act_as_owner();
select is((select cancelled_by from public.bookings where id = tests.p5('ACC2')), 'driver',
  'BUG: the company records its own cancellation as the driver''s, which counts against his rating');

select * from finish();
rollback;
