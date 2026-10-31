-- P0-5: a company cancels its own bookings, any it may; a cancellation tells
-- the right people once, frees the driver's calendar, is logged, and stays
-- final. Runs on P0-5 (on top of P0-1..P0-4 part A) and again with P0-3 part B
-- and P0-4 part B applied. One transaction, rolled back; nothing leaves the
-- machine (net.http_post is the shim's recorder).
begin;
select * from no_plan();
\ir fixtures/p0_5_seed.sql

-- more bookings for this file (C1's; days from now): NEWACC at ACC's time,
-- open; RUN2 RUN3 for E1 (+25 / +26); MST3 a convoy with LEG5 (E1, +30) and
-- LEG6 open; MST5 a convoy with LEG7 open; OPEN3 open (+27); OLDP offered to
-- E3 (+28); SOON for E1 and SOON2 for E2, both in about 12 hours.
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code, parent_booking_id,
                             is_group_master, leg_index)
select tests.p5(b), tests.p5('C1'), case when d is null then null else tests.p5(d) end, 'transfer', 'pending', dd,
       'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2, 'V-' || b,
       case when par is null then null else tests.p5(par) end, coalesce(gm, false), li
  from (values
    ('NEWACC', null::text, (select date_display from public.bookings where id = tests.p5('ACC')), null::text, null::boolean, null::int),
    ('RUN2',   null, (now() + interval '25 days')::text, null, null, null),
    ('RUN3',   null, (now() + interval '26 days')::text, null, null, null),
    ('MST3',   null, (now() + interval '30 days')::text, null, true, null),
    ('MST5',   null, (now() + interval '31 days')::text, null, true, null),
    ('OPEN3',  null, (now() + interval '27 days')::text, null, null, null),
    ('OLDP',   'E3', (now() + interval '28 days')::text, null, null, null),
    ('SOON',   null, (now() + interval '12 hours')::text, null, null, null),
    ('SOON2',  null, (now() + interval '12 hours 10 minutes')::text, null, null, null)
  ) as x(b, d, dd, par, gm, li);
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, passengers, voucher_code, parent_booking_id, leg_index)
select tests.p5(b), tests.p5('C1'), null, 'transfer', 'pending', (now() + make_interval(days => dd))::text,
       'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 2, 'V-' || b, tests.p5(par), li
  from (values ('LEG5', 'MST3', 30, 1), ('LEG6', 'MST3', 30, 2), ('LEG7', 'MST5', 31, 1)) as x(b, par, dd, li);
select tests.act_as(tests.p5('C1'));
select public.accept_booking_atomic(tests.p5(b), tests.p5(d), tests.p5(v))
  from (values ('RUN2', 'E1', 'vE1'), ('RUN3', 'E1', 'vE1'), ('LEG5', 'E1', 'vE1'),
               ('SOON', 'E1', 'vE1'), ('SOON2', 'E2', 'vE2')) as x(b, d, v);
select tests.act_as_owner();
update public.bookings set status = 'in_progress' where id = tests.p5('RUN3');
delete from public.booking_history;
delete from public.notifications;
delete from net.http_calls;

-- 1. The parts, and who may call them ------------------------------------------

select ok(tests.p5_applied(), 'cancel_booking_by_company(booking, reason) exists');
select ok(has_function_privilege('authenticated', 'public.cancel_booking_by_company(uuid,text)', 'execute'),
  'a signed-in account may call it (the function itself checks the booking)');
select ok(not has_function_privilege('anon', 'public.cancel_booking_by_company(uuid,text)', 'execute'),
  'a visitor who is not signed in may not');
select ok(not has_function_privilege('authenticated', 'public.sync_convoy_master_status(uuid)', 'execute'),
  'the convoy helper is the server''s own');
select ok(not has_function_privilege('authenticated', 'public.bookings_after_cancel()', 'execute')
      and not has_function_privilege('authenticated', 'public.bookings_guard_cancellation()', 'execute'),
  'the two trigger functions cannot be called from the apps');
select tests.act_as_anon();
select is(tests.cancel(tests.p5('OPEN')), '42501', 'not signed in: refused');
select tests.act_as_owner();

-- 2. Only the booking's own company, or KEKE -----------------------------------

select tests.act_as(tests.p5('C2'));
select is(tests.cancel(tests.p5('ACC')), 'forbidden', 'another company cannot cancel C1''s booking');
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('ACC'))), 0,
  '... nor with a direct update: the row is not its own');
select tests.act_as(tests.p5('E1'));
select is(tests.cancel(tests.p5('ACC')), 'forbidden', 'the booking''s own driver does not use the company''s cancel');
select tests.act_as(tests.p5('E3'));
select is(tests.cancel(tests.p5('ACC')), 'forbidden', 'nor does a driver with nothing to do with it');
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('ACC'))), 0,
  'whose direct update changes nothing either');
select tests.act_as(tests.p5('E2'));
select ok(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('OFFER'))) <= 0,
  'the driver a job is only offered to cannot cancel it for the company (he declines it, P0-1; refused, or with P0-3 part B not even visible)');
select tests.act_as(tests.p5('H'));
select is(tests.cancel(tests.p5('FLT')), 'forbidden', 'a fleet owner does not use the company''s cancel');
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(gen_random_uuid()), 'not_found', 'a booking that does not exist: not_found');
select is(tests.cancel(null), 'not_found', 'no booking at all: not_found');
select tests.act_as_owner();
select is(tests.status_of(tests.p5('ACC')), 'accepted', 'ACC is untouched by all of that');
select is(tests.status_of(tests.p5('OFFER')), 'pending', 'and so is OFFER');
select is((select count(*)::int from public.notifications), 0, 'nobody has been told anything');
select is((select count(*)::int from public.booking_history), 0, 'and nothing went into the change log');

-- 3. What the company cancels, and what each cancellation does ---------------------

-- an open booking nobody has taken
select tests.act_as(tests.p5('C1'));
select is(public.cancel_booking_by_company(tests.p5('OPEN'), 'plans changed') - 'message',
  '{"ok": true, "code": "cancelled", "previous_status": "pending", "driver_told": false}'::jsonb,
  'an open booking: cancelled; no driver to tell');
select tests.act_as_owner();
select is(tests.status_of(tests.p5('OPEN')), 'cancelled', 'OPEN is cancelled');
select is((select cancelled_by from public.bookings where id = tests.p5('OPEN')), 'company', 'stamped: by the company');
select ok((select cancelled_at is not null from public.bookings where id = tests.p5('OPEN')), 'with the time');
select is((select count(*)::int from public.notifications), 0, 'nobody is told about a booking nobody had taken');
select is((select count(*)::int from public.booking_history h where h.booking_id = tests.p5('OPEN')), 1,
  'one line in its change log');
select is((select h.changed_by from public.booking_history h where h.booking_id = tests.p5('OPEN')), tests.p5('C1'),
  'which says who cancelled');
select is((select h.changes -> 'status' from public.booking_history h where h.booking_id = tests.p5('OPEN')),
  '{"old": "pending", "new": "cancelled", "label": "სტატუსი"}'::jsonb, 'from which status');
select is((select h.reason from public.booking_history h where h.booking_id = tests.p5('OPEN')),
  'cancelled_by_company: plans changed', 'and why');

-- a booking offered to one driver
select tests.act_as(tests.p5('C1'));
select is(public.cancel_booking_by_company(tests.p5('OFFER')) ->> 'driver_told', 'true',
  'a booking offered to one driver: cancelled, and the answer says the driver is told');
select tests.act_as_owner();
select is(tests.notices(tests.p5('E2'), 'booking_cancelled', tests.p5('OFFER')), 1, 'the driver it was offered to is told, once');
select is(tests.pushes_to(tests.tok5('E2')), 1, 'on his phone as well');
select ok(tests.notice_text(tests.p5('E2'), 'booking_cancelled')
          like 'KEKE · ჯავშანი გაუქმდა | კომპანიამ გააუქმა ჯავშანი' || E'\n' || 'Test airport%',
  'in Georgian: the company cancelled, and which booking');
select is((select n.data ->> 'booking_id' || ' ' || (n.data ->> 'cancelled_by') from public.notifications n
            where n.user_id = tests.p5('E2') and n.type = 'booking_cancelled'),
  tests.p5('OFFER')::text || ' company', 'the notice names the booking (for the app to open) and who cancelled');
select is(tests.history_lines(tests.p5('OFFER')), 1, 'logged once');

-- a booking a driver has accepted
select tests.act_as(tests.p5('C1'));
select is(public.accept_booking_atomic(tests.p5('NEWACC'), tests.p5('E1'), tests.p5('vE1')) ->> 'code', 'driver_busy',
  'before: E1 is booked at ACC''s time, so he cannot take another job then');
select is(public.cancel_booking_by_company(tests.p5('ACC'), null) - 'message',
  '{"ok": true, "code": "cancelled", "previous_status": "accepted", "driver_told": true}'::jsonb,
  'an accepted booking: the company cancels it');
select tests.act_as_owner();
select ok(not tests.blocked(tests.p5('ACC')), 'its block in the driver''s calendar is gone');
select ok(tests.driver_free_at(tests.p5('E1'), tests.p5('ACC')), 'E1 is free at that time again');
select is(tests.notices(tests.p5('E1'), 'booking_cancelled', tests.p5('ACC')), 1, 'E1 is told, once');
select is(tests.pushes_to(tests.tok5('E1')), 1, 'on his phone as well');
select is((select h.reason from public.booking_history h where h.booking_id = tests.p5('ACC')), 'cancelled_by_company',
  'without a reason the log still says who');
select is((select count(*)::int from public.booking_emails e where e.booking_id = tests.p5('ACC') and e.event = 'cancelled'), 1,
  'the company''s cancellation email is queued, as before');
select is((select cancelled_by from public.bookings where id = tests.p5('ACC')), 'company',
  'stamped as the company''s: it does not count against the driver''s rating');
select tests.act_as(tests.p5('C1'));
select is(public.accept_booking_atomic(tests.p5('NEWACC'), tests.p5('E1'), tests.p5('vE1')) ->> 'code', 'accepted',
  'after: E1 can take another job at that time');
select is(tests.cancel(tests.p5('ACC')), 'already_cancelled', 'cancelling ACC again: already_cancelled');
select tests.act_as_owner();
select is(tests.notices(tests.p5('E1'), 'booking_cancelled', tests.p5('ACC')), 1, 'E1 is not told twice');
select is(tests.history_lines(tests.p5('ACC')), 1, 'nor is it logged twice');

-- a job a fleet owner gave his driver
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(tests.p5('FLT')), 'cancelled', 'a job a fleet owner gave his driver: cancelled');
select tests.act_as_owner();
select is(tests.notices(tests.p5('S'), 'booking_cancelled', tests.p5('FLT')), 1, 'the driver on it is told, once');
select is(tests.notices(tests.p5('H'), 'booking_cancelled', tests.p5('FLT')), 1, 'and his fleet owner, once');
select is(tests.pushes_to(tests.tok5('S')) + tests.pushes_to(tests.tok5('H')), 2, 'one phone notification each');
select ok(not tests.blocked(tests.p5('FLT')), 'S''s calendar is freed');
select is(tests.notices(tests.p5('C1'), 'booking_cancelled'), 0, 'the company that cancelled is not told its own news');

-- a trip in progress: not the company's to stop
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(tests.p5('RUN')), 'trip_in_progress', 'a trip in progress: the company cannot cancel it');
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('RUN'))), -1,
  '... nor with a direct update');
select is(tests.try_sql(format('update public.bookings set status = ''pending'' where id = %L', tests.p5('RUN'))), -1,
  '... nor set it back to pending');
select is(tests.try_sql(format('update public.bookings set status = ''rejected'' where id = %L', tests.p5('RUN'))), -1,
  '... nor mark it rejected');
select tests.act_as_owner();
select is(tests.status_of(tests.p5('RUN')), 'in_progress', 'the trip goes on');
select ok(tests.blocked(tests.p5('RUN')), 'E3''s calendar still holds it');
select is(tests.notices(tests.p5('E3'), 'booking_cancelled'), 0, 'E3 is not told anything');
select is(tests.history_lines(tests.p5('RUN')), 0, 'a refused cancellation is not logged');

-- finished bookings stay finished
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(tests.p5('DONE')), 'already_completed', 'a completed booking: already_completed, nothing changes');
select is(tests.cancel(tests.p5('CNL')), 'already_cancelled', 'a cancelled one: already_cancelled');
select is(tests.cancel(tests.p5('REJ')), 'already_closed', 'a declined one: already_closed');
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('DONE'))), -1,
  'a completed booking cannot be cancelled with a direct update');
select is(tests.try_sql(format('update public.bookings set status = ''pending'' where id = %L', tests.p5('CNL'))), -1,
  'a cancelled booking cannot be brought back to pending');
select is(tests.try_sql(format('update public.bookings set status = ''rejected'' where id = %L', tests.p5('OPEN3'))), -1,
  'a company does not mark a booking rejected (that skipped the notice and the log): it cancels it');
select is(tests.try_sql(format('update public.bookings set comment = ''note'' where id = %L', tests.p5('CNL'))), 1,
  'only the status is final: the rest of a cancelled booking is as writable as before');
select tests.act_as(tests.p5('E1'));
select is(tests.try_sql(format('update public.bookings set status = ''in_progress'' where id = %L', tests.p5('DONE'))), -1,
  'the driver cannot reopen a completed trip either');
select is(public.accept_booking_atomic(tests.p5('CNL'), tests.p5('E1'), tests.p5('vE1')) ->> 'code', 'not_pending',
  'nobody takes a cancelled booking');
select is(public.accept_booking_atomic(tests.p5('OPEN'), tests.p5('E1'), tests.p5('vE1')) ->> 'code', 'not_pending',
  'nor the open booking the company has just cancelled');
select tests.act_as(tests.p5('E2'));
select is(public.accept_booking_atomic(tests.p5('OFFER'), tests.p5('E2'), tests.p5('vE2')) ->> 'code', 'not_pending',
  'nor the driver it had been offered to');
select tests.act_as(tests.p5('C1'));
select is(public.accept_booking_atomic(tests.p5('ACC'), tests.p5('E2'), tests.p5('vE2')) ->> 'code', 'not_pending',
  'nor can the company give a cancelled booking to a driver');

-- 4. A driver still cancels his own job, as before -------------------------------

select tests.act_as(tests.p5('E1'));
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('RUN2'))), 1,
  'a driver cancels a job he accepted (his app''s direct update)');
select is(public.notify_booking_event(tests.p5('RUN2'), 'driver_cancelled'), 1,
  'and his app has the server tell the company (P0-4)');
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L', tests.p5('RUN3'))), 1,
  'he can cancel his own trip in progress too, as before');
select tests.act_as_owner();
select is((select string_agg(cancelled_by, ',' order by id) from public.bookings where id in (tests.p5('RUN2'), tests.p5('RUN3'))),
  'driver,driver', 'stamped as the driver''s');
select is(tests.notices(tests.p5('E1'), 'booking_cancelled', tests.p5('RUN2')), 0, 'the driver is not told his own news');
select is(tests.notices(tests.p5('C1'), 'booking_cancelled'), 0, 'nor does the server repeat it to the company as a company cancellation');
select is(tests.history_lines(tests.p5('RUN2')) + tests.history_lines(tests.p5('RUN3')), 2, 'both are logged');
select is((select h.changed_by from public.booking_history h where h.booking_id = tests.p5('RUN2')), tests.p5('E1'),
  'with who');
select ok(not tests.blocked(tests.p5('RUN2')) and not tests.blocked(tests.p5('RUN3')), 'and his calendar is freed');

-- 5. KEKE -------------------------------------------------------------------------

select tests.act_as(tests.p5('ADM'));
select is(tests.cancel(tests.p5('C2ACC')), 'cancelled', 'KEKE can cancel any company''s booking');
select is(tests.cancel(tests.p5('RUN')), 'cancelled', 'even a trip in progress');
select tests.act_as_owner();
select is((select cancelled_by from public.bookings where id = tests.p5('RUN')), 'admin', 'stamped as KEKE''s');
select ok(tests.notice_text(tests.p5('E3'), 'booking_cancelled') like '%KEKE-მ გააუქმა ჯავშანი%',
  'E3 is told that KEKE cancelled his trip');
select is(tests.notices(tests.p5('E2'), 'booking_cancelled', tests.p5('C2ACC')), 1, 'and C2ACC''s driver is told');
select ok(not tests.blocked(tests.p5('RUN')), 'E3''s calendar is freed');
select is((select h.changed_by from public.booking_history h where h.booking_id = tests.p5('RUN')), tests.p5('ADM'),
  'logged with KEKE''s account');
select tests.act_as(tests.p5('ADM'));
select is(tests.try_sql(format('update public.bookings set status = ''pending'' where id = %L', tests.p5('REJ'))), 1,
  'KEKE can still correct a booking''s status by hand');
select tests.act_as_owner();

-- 6. Convoys --------------------------------------------------------------------

-- MST: LEG1 accepted by E3, LEG2 open
select tests.act_as(tests.p5('C1'));
select is(public.cancel_booking_by_company(tests.p5('MST'), 'test') - 'message',
  '{"ok": true, "code": "cancelled", "previous_status": "accepted", "cancelled_cars": 2}'::jsonb,
  'a convoy: every car that has not finished, then the convoy itself');
select tests.act_as_owner();
select is((select string_agg(status, ',' order by leg_index) from public.bookings where parent_booking_id = tests.p5('MST')),
  'cancelled,cancelled', 'both cars are cancelled');
select is(tests.status_of(tests.p5('MST')), 'cancelled', 'and the convoy');
select is(tests.notices(tests.p5('E3'), 'booking_cancelled', tests.p5('LEG1')), 1, 'the driver of the taken car is told, once');
select ok(not tests.blocked(tests.p5('LEG1')), 'his calendar is freed');
select is(tests.history_lines(tests.p5('LEG1')) + tests.history_lines(tests.p5('LEG2')) + tests.history_lines(tests.p5('MST')), 3,
  'each car and the convoy have their line in the log');
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(tests.p5('MST')), 'already_cancelled', 'cancelling the convoy again: already_cancelled');
select is(tests.try_sql(format('update public.bookings set status = ''pending'' where id = %L', tests.p5('MST'))), -1,
  'a cancelled convoy stays cancelled (an installed app''s re-sync cannot reopen it)');

-- MST2: LEG3 on the road (E2), LEG4 open
select is(tests.cancel(tests.p5('MST2')), 'convoy_in_progress', 'a convoy with a car on the road: refused');
select tests.act_as_owner();
select is((select string_agg(status, ',' order by leg_index) from public.bookings where parent_booking_id = tests.p5('MST2'))
          || ' / ' || tests.status_of(tests.p5('MST2')),
  'in_progress,pending / in_progress', 'nothing changed');
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(tests.p5('LEG4')), 'cancelled', 'one car of it that has not left can still be cancelled');
select tests.act_as_owner();
select is(tests.status_of(tests.p5('MST2')), 'in_progress', 'the convoy stays in progress while its other car drives');
update public.bookings set status = 'completed' where id = tests.p5('LEG3');
select public.sync_convoy_master_status(tests.p5('MST2'));
select is(tests.status_of(tests.p5('MST2')), 'completed',
  'when that car finishes, the convoy is completed (one car done, one cancelled), not left pending');

-- MST3: an installed app cancels a convoy the old way, car by car
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'', updated_at = now() where id = %L and status = ''accepted''', tests.p5('LEG5')))
        + tests.try_sql(format('update public.bookings set status = ''cancelled'', updated_at = now() where id = %L and status = ''pending''', tests.p5('LEG6')))
        + tests.try_sql(format('update public.bookings set status = ''cancelled'', updated_at = now() where id = %L and status <> ''completed''', tests.p5('MST3'))),
  3, 'an installed app''s convoy cancel (each car, then the convoy) still works');
select tests.act_as_owner();
select is(tests.notices(tests.p5('E1'), 'booking_cancelled', tests.p5('LEG5')), 1, 'and now the car''s driver is told, once');
select is(tests.notices(tests.p5('E1'), 'booking_cancelled', tests.p5('MST3')), 0, 'the convoy row itself tells nobody (it has no driver)');

-- MST5: an installed app sets an open convoy's status from its cars
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''accepted'' where id = %L', tests.p5('MST5'))), 1,
  'an installed app can still set an open convoy''s status from its cars');
select tests.act_as_owner();

-- 7. After a cancellation nothing brings it back ------------------------------------

-- the dispatch of a new booking
select tests.act_as(tests.p5('C1'));
select is(public.dispatch_new_booking(tests.p5('OPEN')) ->> 'open', 'false', 'a cancelled booking is not sent to drivers');
select is(public.enqueue_booking_push(tests.p5('OPEN'), array[tests.tok5('E1')], 'x', 'y', '{}'::jsonb, 180), 0,
  'nor queued for a second wave');
select tests.act_as_owner();
insert into public.push_outbox (booking_id, user_id, token, title, body, data, send_after)
values (tests.p5('OPEN3'), tests.p5('E1'), '', 't', 'b', '{}'::jsonb, now() + interval '3 minutes');
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(tests.p5('OPEN3')), 'cancelled', 'OPEN3, with a second wave waiting, is cancelled');
select tests.act_as_owner();
select is((select count(*)::int from public.push_outbox where booking_id = tests.p5('OPEN3') and sent_at is null), 0,
  'its waiting second wave is dropped');
update public.push_outbox set send_after = now() - interval '1 minute' where booking_id = tests.p5('OPEN3');
select is(public.flush_push_outbox(), 0, 'the next flush sends nothing');
select is(tests.notices(tests.p5('E1'), 'new_booking', tests.p5('OPEN3')), 0, 'E1 never hears of OPEN3');

-- the reminder worker
select tests.act_as(tests.p5('C1'));
select is(tests.cancel(tests.p5('SOON')), 'cancelled', 'SOON, in twelve hours, is cancelled');
select tests.act_as_owner();
select public.run_booking_reminders();
select is((select count(*)::int from public.notifications n where n.data ->> 'bookingId' = tests.p5('SOON')::text), 0,
  'the reminder worker sends nothing about it');
select is((select count(*)::int from public.notifications n
            where n.data ->> 'bookingId' = tests.p5('SOON2')::text and n.type = 'booking_reminder_12h'), 1,
  'while SOON2, at the same hour, gets its reminder (the worker did run)');
select is(public.reassign_booking_to_driver(tests.p5('SOON'), tests.p5('E3'), tests.p5('vE3'), 'Test E3', null, null), false,
  'the automatic replacement refuses a cancelled booking');
select is(tests.status_of(tests.p5('SOON')) || ' ' || (select driver_id::text from public.bookings where id = tests.p5('SOON')),
  'cancelled ' || tests.p5('E1')::text, 'it stays cancelled, with nobody new on it');
select is((select count(*)::int from public.driver_schedules where booking_id = tests.p5('SOON')), 0,
  'and it holds nobody''s calendar');

-- 8. An installed (old) company app -------------------------------------------------

select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('update public.bookings set status = ''cancelled'' where id = %L and company_id = %L and status = ''pending''',
                               tests.p5('OLDP'), tests.p5('C1'))), 1,
  'an installed app''s cancel of a pending booking still works');
select tests.act_as_owner();
select is(tests.notices(tests.p5('E3'), 'booking_cancelled', tests.p5('OLDP')), 1, 'and now the driver it was offered to is told');
select is((select h.reason from public.booking_history h where h.booking_id = tests.p5('OLDP')), 'cancelled_by_company',
  'and it is logged');

-- 9. Counted once, sent once --------------------------------------------------------

select is((select count(*)::int from (select n.user_id, n.data ->> 'booking_id'
                                        from public.notifications n where n.type = 'booking_cancelled'
                                       group by 1, 2 having count(*) > 1) d), 0,
  'nobody got two cancellation notices for one booking');
select is((select count(*)::int from public.notifications n where n.type = 'booking_cancelled'), 10,
  'ten cancellation notices in all: E1 (ACC, LEG5, SOON), E2 (OFFER, C2ACC), E3 (RUN, LEG1, OLDP), S and H (FLT); none for the open bookings, the convoy rows or a driver''s own cancellation');
select is((select count(*)::int from net.http_calls c where c.url like 'https://exp.host/%'
            and c.body -> 'data' ->> 'type' = 'booking_cancelled'), 10, 'and one phone notification for each');

select * from finish();
rollback;
