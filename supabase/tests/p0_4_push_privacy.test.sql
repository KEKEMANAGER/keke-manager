-- P0-4: push tokens are the server's, and the server decides who is told
-- what. Runs on part A and on part A + B (checks that only hold with part B
-- are skipped on part A, and the other way round). One transaction, rolled
-- back; nothing leaves the machine (net.http_post is the shim's recorder).
begin;
select * from no_plan();
\ir fixtures/p0_4_seed.sql

-- 1. The token store ---------------------------------------------------------

select is((select count(*)::int from public.push_tokens), 13,
  'every phone that registered is in push_tokens (13 seeded accounts)');
select is((select token from public.push_tokens where user_id = tests.p4('E1')), tests.tok('E1'),
  'push_tokens holds the token the app registered');

select tests.act_as_anon();
select is(tests.try_value('select count(*)::text from public.push_tokens'), 'denied',
  'not signed in: push_tokens cannot be read');
select tests.act_as(tests.p4('E1'));
select is(tests.try_value('select count(*)::text from public.push_tokens'), 'denied',
  'a driver cannot read push_tokens, not even his own row');
select tests.act_as(tests.p4('ADM'));
select is(tests.try_value('select count(*)::text from public.push_tokens'), 'denied',
  'an admin''s app cannot read push_tokens either');
select tests.act_as(tests.p4('E1'));
select is(tests.try_sql(format('insert into public.push_tokens (user_id, token) values (%L, %L)', tests.p4('E1'), tests.tok('E1-x'))), -1,
  'a driver cannot write into push_tokens directly');
select is(tests.try_sql(format('update public.push_tokens set token = %L', tests.tok('E1-x'))), -1,
  'a driver cannot change push_tokens directly');
select is(tests.try_sql('delete from public.push_tokens'), -1,
  'a driver cannot delete from push_tokens directly');

select is(tests.try_value(format('select public.fetch_user_push_token(%L)', tests.p4('C1'))), 'denied',
  'a signed-in user cannot look up anyone''s token through fetch_user_push_token');
select is(tests.try_value(format('select public.booking_dispatch_candidates(%L)::text', tests.p4('OPEN1'))), 'denied',
  'a signed-in user cannot list who would be told about a booking');
select is(tests.try_value(format('select public.deliver_notification(%L, ''x'', ''y'', ''general'', ''{}'', null)::text', tests.p4('E2'))), 'denied',
  'a signed-in user cannot call the server''s delivery helper');
select is(tests.try_value(format('select public.booking_notify(%L, ''x'', ''y'', ''general'', ''{}'')::text', tests.p4('E2'))), 'denied',
  'a signed-in user cannot call booking_notify');
select is(tests.try_value(format('select public.send_expo_push(%L, ''x'', ''y'', ''{}'')::text', tests.tok('E2'))), 'denied',
  'a signed-in user cannot call send_expo_push');
select is(tests.try_value('select public.flush_push_outbox()::text'), 'denied',
  'a signed-in user cannot run the outbox flush');
select is(tests.try_value(format('select public.dispatch_new_booking_push(%L, 1)::text', tests.p4('OPEN1'))), 'denied',
  'a signed-in user cannot run the server''s dispatch directly');
select is(tests.try_value('select public.is_expo_push_token(''x'')::text'), 'denied',
  'the token helpers are not callable by clients');

-- 2. Registering, rotating and removing one's own token (every app version) --

select tests.act_as(tests.p4('E1'));
-- lib/profiles.ts saveDriverPushToken: update profiles, return the row, then users = null
select is(
  tests.try_sql(format('update public.profiles set push_token = %L where id = %L returning id, vehicle_type, vehicle_class, push_token',
                       tests.tok('E1-new'), tests.p4('E1'))),
  1, 'registering: the app''s profile update goes through and returns its row');
update public.users set push_token = null where id = tests.p4('E1');
select tests.act_as_owner();
select is((select token from public.push_tokens where user_id = tests.p4('E1')), tests.tok('E1-new'),
  'a new token replaces the old one');
select is(public.fetch_user_push_token(tests.p4('E1')), tests.tok('E1-new'),
  'the server''s lookup finds the new token');
select is(
  case when tests.p4_part_b() then (select push_token from public.profiles where id = tests.p4('E1')) else 'not part B' end,
  case when tests.p4_part_b() then null else 'not part B' end,
  'part B: the token is not kept on the profile');

-- sign-out (contexts/AuthContext.tsx → clearProfilePushToken)
select tests.act_as(tests.p4('E1'));
update public.profiles set push_token = null where id = tests.p4('E1');
update public.users set push_token = null where id = tests.p4('E1');
select tests.act_as_owner();
select is((select count(*)::int from public.push_tokens where user_id = tests.p4('E1')), 0,
  'signing out removes the token');
select is(public.fetch_user_push_token(tests.p4('E1')), null,
  'after signing out the server finds no phone for him');

-- signs in again
select tests.act_as(tests.p4('E1'));
update public.profiles set push_token = tests.tok('E1') where id = tests.p4('E1');
select tests.act_as_owner();
select is(public.fetch_user_push_token(tests.p4('E1')), tests.tok('E1'),
  'signing in again registers the phone again');

-- first registration without a profile row (lib/profiles.ts insert path)
insert into auth.users (id, email) values (tests.p4('N'), 'p04-n@test.invalid');
insert into public.users (id, role, full_name, email) values (tests.p4('N'), 'driver', 'Test N', 'p04-n@test.invalid');
select tests.act_as(tests.p4('N'));
insert into public.profiles (id, push_token) values (tests.p4('N'), tests.tok('N'));
select tests.act_as_owner();
select is(public.fetch_user_push_token(tests.p4('N')), tests.tok('N'),
  'a first registration that creates the profile row is stored');

-- only one's own
select tests.act_as(tests.p4('E1'));
select is(tests.try_sql(format('update public.profiles set push_token = %L where id = %L', tests.tok('evil'), tests.p4('E2'))), 0,
  'nobody can put a token on someone else''s profile');
select ok(tests.try_sql(format('insert into public.profiles (id, push_token) values (%L, %L)', tests.p4('HD'), tests.tok('evil'))) < 0,
  'nobody can create someone else''s profile with a token');
select tests.act_as_owner();
select is(public.fetch_user_push_token(tests.p4('E2')), tests.tok('E2'),
  'the other driver''s phone is unchanged');

-- something that is not an Expo token is not kept
select tests.act_as(tests.p4('E3'));
update public.profiles set push_token = 'not-a-token' where id = tests.p4('E3');
select tests.act_as_owner();
select is(public.fetch_user_push_token(tests.p4('E3')),
  case when tests.p4_part_b() then null else 'not-a-token' end,
  'a value that is not an Expo token is never stored as one (part A: the old column is still read)');
select tests.act_as(tests.p4('E3'));
update public.profiles set push_token = tests.tok('E3') where id = tests.p4('E3');
select tests.act_as_owner();

-- an old app version that writes users.push_token
select tests.act_as(tests.p4('E2'));
update public.users set push_token = tests.tok('E2-legacy') where id = tests.p4('E2');
select tests.act_as_owner();
select is((select token from public.push_tokens where user_id = tests.p4('E2')), tests.tok('E2-legacy'),
  'a token written on users by an old app version is kept too');
select is(
  case when tests.p4_part_b() then (select push_token from public.users where id = tests.p4('E2')) else 'not part B' end,
  case when tests.p4_part_b() then null else 'not part B' end,
  'part B: users.push_token stays empty');
select tests.act_as(tests.p4('E2'));
update public.profiles set push_token = tests.tok('E2') where id = tests.p4('E2');
select tests.act_as_owner();

-- one phone, two accounts (a sign-out that never reached the server)
select tests.act_as(tests.p4('X'));
update public.profiles set push_token = tests.tok('HD') where id = tests.p4('X');
select tests.act_as_owner();
select is(public.fetch_user_push_token(tests.p4('X')), tests.tok('HD'), 'the phone is registered for the account signed in on it');
select is(public.fetch_user_push_token(tests.p4('HD')),
  case when tests.p4_part_b() then null else tests.tok('HD') end,
  'part B: the account that left that phone no longer gets its notifications (part A: unchanged)');
select tests.act_as(tests.p4('HD'));
update public.profiles set push_token = tests.tok('HD') where id = tests.p4('HD');
select tests.act_as(tests.p4('X'));
update public.profiles set push_token = tests.tok('X') where id = tests.p4('X');
select tests.act_as_owner();

-- 3. Nobody reads anyone's token (part B) -----------------------------------

select tests.act_as(tests.p4('U'));
select is(
  case when tests.p4_part_b() then (select count(*)::int from public.profiles where push_token is not null) else -1 end,
  case when tests.p4_part_b() then 0 else -1 end,
  'part B: a fresh sign-up finds no token on any profile');
select tests.act_as(tests.p4('E1'));
select is(
  case when tests.p4_part_b() then (select push_token from public.profiles where id = tests.p4('C1')) else 'skip' end,
  case when tests.p4_part_b() then null else 'skip' end,
  'part B: a driver finds no token on the company''s profile');
select tests.act_as(tests.p4('C1'));
select is(
  case when tests.p4_part_b() then (select count(*)::int from public.users where push_token is not null) else -1 end,
  case when tests.p4_part_b() then 0 else -1 end,
  'part B: a company finds no token on the users it may see');
-- installed versions still select the column: no permission error
select tests.act_as(tests.p4('E1'));
select is(tests.try_value(format('select count(*)::text from (select id, vehicle_type, vehicle_class, push_token, is_verified from public.profiles where id = %L) x', tests.p4('E1'))), '1',
  'installed app versions can still select profiles.push_token (no screen breaks)');
select tests.act_as_owner();

-- 4. The server's dispatch ---------------------------------------------------

select is(public.dispatch_new_booking_push(tests.p4('OPEN1'), 1), 2,
  'the server''s dispatch tells two drivers about OPEN1');
select is(tests.notices(tests.p4('E1'), 'new_booking', tests.p4('OPEN1')) + tests.notices(tests.p4('E2'), 'new_booking', tests.p4('OPEN1')), 2,
  'they are the two approved drivers who may take it');
select is(
  (select count(*)::int from public.notifications
    where type = 'new_booking' and data ->> 'booking_id' = tests.p4('OPEN1')::text
      and user_id in (tests.p4('E3'), tests.p4('BL'), tests.p4('PO'), tests.p4('U'), tests.p4('HD'),
                      tests.p4('X'), tests.p4('S'), tests.p4('C1'))), 0,
  'not the decliner, the blocked driver, the unapproved ones, the hired driver, other cars or the company');
select is(tests.pushes_to(tests.tok('E1')) + tests.pushes_to(tests.tok('E2')), 2, 'their phones get one push each');
select is(tests.pushes_to(tests.tok('BL')) + tests.pushes_to(tests.tok('E3')) + tests.pushes_to(tests.tok('PO')), 0,
  'the others'' phones get nothing');
select ok(tests.push_texts(tests.tok('E1')) like 'KEKE · ახალი ტრანსფერი!%', 'the text is the server''s own');
select is(public.dispatch_new_booking_push(tests.p4('OPEN1'), 1), 0, 'dispatching OPEN1 again tells nobody');
select is(public.dispatch_new_booking_push(tests.p4('OPEN1'), 2), 0, 'nor does the second wave');
select is(tests.pushes_to(tests.tok('E1')), 1, 'nobody is told twice');
select is((select count(*)::int from public.dispatch_log where booking_id = tests.p4('OPEN1')), 1,
  'the dispatch log has one row for OPEN1 (the repeats add no "reached nobody" row)');
select is((select wave1_driver_ids @> array[tests.p4('E1'), tests.p4('E2')] and cardinality(wave1_driver_ids) = 2
             from public.dispatch_log where booking_id = tests.p4('OPEN1')), true,
  'it records who was told');
delete from public.notifications;
delete from net.http_calls;

-- 5. dispatch_new_booking: the app's order, the server's rules ---------------

select tests.act_as_anon();
select is(tests.sqlstate_of(format('select public.dispatch_new_booking(%L)', tests.p4('OPEN2'))), '42501',
  'not signed in: cannot dispatch');
select tests.act_as(tests.p4('E1'));
select is(tests.sqlstate_of(format('select public.dispatch_new_booking(%L)', tests.p4('OPEN2'))), '42501',
  'a driver cannot dispatch a company''s booking');
select tests.act_as(tests.p4('C2'));
select is(tests.sqlstate_of(format('select public.dispatch_new_booking(%L)', tests.p4('OPEN2'))), '42501',
  'another company cannot dispatch it');

select tests.act_as(tests.p4('C1'));
select is(
  public.dispatch_new_booking(tests.p4('OPEN2'),
    array[tests.p4('E1'), tests.p4('BL'), tests.p4('PO'), tests.p4('U'), tests.p4('C2'), tests.p4('HD')],
    array[tests.p4('E2')]),
  '{"notified": 1, "queued": 1}'::jsonb,
  'the company''s order: of six names for now only E1 may be told; E2 is queued for later');
select tests.act_as_owner();
select is(tests.notices(tests.p4('E1'), 'new_booking', tests.p4('OPEN2')), 1, 'E1 is told now');
select is(
  (select count(*)::int from public.notifications where type = 'new_booking'
      and user_id in (tests.p4('BL'), tests.p4('PO'), tests.p4('U'), tests.p4('C2'), tests.p4('HD'))), 0,
  'names the server would not pick are dropped, whatever the app sends');
select is(tests.notices(tests.p4('E3'), 'new_booking', tests.p4('OPEN2')), 0,
  'a driver the app left out is not told by this call');
select is(tests.notices(tests.p4('E2'), 'new_booking', tests.p4('OPEN2')), 0, 'E2 waits for the second wave');
select is(tests.outbox_rows(tests.p4('OPEN2')), 1, 'one second-wave row is waiting');
select is((select dispatch_fallback_sent_at is not null from public.bookings where id = tests.p4('OPEN2')), true,
  'the one-minute fallback will leave this booking alone');
select public.dispatch_new_booking_push(tests.p4('OPEN2'), 2);
select is(tests.notices(tests.p4('E2'), 'new_booking', tests.p4('OPEN2')), 0,
  'even if the server''s own second wave ran, it would not reach E2 ahead of his queued push');
select is(tests.flush_now(), 1, 'the flush sends the waiting row');
select is(tests.notices(tests.p4('E2'), 'new_booking', tests.p4('OPEN2')), 1, 'E2 gets the in-app notice then');
select is(tests.pushes_to(tests.tok('E2')), 1, 'and one push');
select is(tests.flush_now(), 0, 'a second flush sends nothing');
select tests.act_as(tests.p4('C1'));
select is(public.dispatch_new_booking(tests.p4('OPEN2'), array[tests.p4('E1')], array[tests.p4('E2')]),
  '{"notified": 0, "queued": 0}'::jsonb, 'asking again tells nobody twice');
select is(public.dispatch_new_booking(tests.p4('ACC1'), array[tests.p4('E2')]) ->> 'open', 'false',
  'a booking that is taken is not dispatched');
-- a job offered to one driver
select public.dispatch_new_booking(tests.p4('ASG1'), array[tests.p4('E1')]);
select is(tests.notices(tests.p4('E1'), 'new_booking', tests.p4('ASG1')), 0,
  'a job offered to E2 is not sent to E1, whatever the app sends');
select is(tests.notices(tests.p4('E2'), 'new_booking', tests.p4('ASG1')), 1,
  'it goes to E2 (the server''s own waves, since the app named nobody it may tell)');
select is(public.dispatch_new_booking(tests.p4('ASG1'), array[tests.p4('E2')]) ->> 'notified', '0',
  'and E2 is not told twice');
-- the app put forward only drivers the server may not tell: the server's waves
insert into public.bookings (id, company_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, voucher_code)
values (tests.p4('OPEN4'), tests.p4('C1'), 'transfer', 'pending', (now() + interval '40 days')::text,
        'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 'V-OPEN4');
select is(public.dispatch_new_booking(tests.p4('OPEN4'), array[tests.p4('BL'), tests.p4('PO')], '{}'::uuid[]) ->> 'notified', '3',
  'an order with only drivers the server may not tell falls back to the server''s own waves (the three who may take it)');
select is(tests.notices(tests.p4('BL'), 'new_booking', tests.p4('OPEN4')) + tests.notices(tests.p4('PO'), 'new_booking', tests.p4('OPEN4')), 0,
  'still not the drivers it may not tell');
-- no order from the app: the server's own waves, once
select tests.act_as(tests.p4('ADM'));
select is(public.dispatch_new_booking(tests.p4('OPEN3')) ->> 'notified', '3',
  'an admin may dispatch; without an order the server''s waves tell the three drivers who may take OPEN3');
select is(public.dispatch_new_booking(tests.p4('OPEN3')) ->> 'already', 'true', 'and only once');
select tests.act_as_owner();
update public.bookings set created_at = now() - interval '2 minutes' where id in (tests.p4('OPEN2'), tests.p4('OPEN3'));
select is(public.dispatch_missed_new_bookings(), 0, 'the one-minute fallback finds nothing left to do for them');
delete from public.notifications;
delete from net.http_calls;
delete from public.push_outbox;

-- 6. enqueue_booking_push: installed apps' second wave -----------------------

-- the installed app wrote E1's in-app notice itself (wave 1), then queues
-- the rest by phone
insert into public.notifications (user_id, type, title, body, data)
values (tests.p4('E1'), 'new_booking', 'KEKE · New transfer!', 'from the app', jsonb_build_object('booking_id', tests.p4('OPEN3')));
select tests.act_as(tests.p4('C1'));
select is(public.enqueue_booking_push(tests.p4('OPEN3'),
            array[tests.tok('E1'), tests.tok('BL'), tests.tok('PO'), 'ExponentPushToken[p04-outsider]', tests.tok('C2')],
            'APP TEXT', 'APP BODY', '{"type": "general"}'::jsonb, 0), 1,
  'of five phones only the one of a driver the server would pick is queued');
select is(public.enqueue_booking_push(tests.p4('OPEN3'), array[tests.tok('E1')], 'APP TEXT', 'APP BODY', '{}'::jsonb, 0), 0,
  'queueing the same driver again adds nothing');
select tests.act_as(tests.p4('C2'));
select is(public.enqueue_booking_push(tests.p4('OPEN3'), array[tests.tok('E2')], 'x', 'y', '{}'::jsonb, 0), 0,
  'another company queues nothing for C1''s booking');
select tests.act_as(tests.p4('E1'));
select is(public.enqueue_booking_push(tests.p4('ACC1'), array[tests.tok('C1')], 'x', 'y', '{}'::jsonb, 0), 0,
  'a driver queues nothing, not even on his own booking');
select tests.act_as_owner();
select is(tests.flush_now(), 1, 'the flush sends one push');
select ok(tests.push_texts(tests.tok('E1')) like 'KEKE · ახალი ტრანსფერი!%', 'with the server''s text');
select ok(tests.push_texts(tests.tok('E1')) not like '%APP%', 'not the text the app sent');
select is(tests.pushes_to('ExponentPushToken[p04-outsider]') + tests.pushes_to(tests.tok('BL')) + tests.pushes_to(tests.tok('C2')), 0,
  'phones the server would not pick get nothing');
select is(tests.notices(tests.p4('E1'), 'new_booking', tests.p4('OPEN3')), 1,
  'E1 already had the in-app notice from the app: he gets the push only, no second notice');

-- the flush checks again when it sends
select tests.act_as(tests.p4('C1'));
select public.enqueue_booking_push(tests.p4('OPEN2'), array[tests.tok('E2'), tests.tok('E3')], 'x', 'y', '{}'::jsonb, 0);
select tests.act_as(tests.p4('E2'));
select public.reject_pending_booking_as_driver(tests.p4('OPEN2'));
select tests.act_as_owner();
update public.users set is_blocked = true where id = tests.p4('E3');
select is(tests.flush_now(), 0, 'a driver who declined meanwhile, or was blocked meanwhile, is not sent the job');
select is(tests.pushes_to(tests.tok('E2')) + tests.pushes_to(tests.tok('E3')), 0, 'their phones get nothing');
update public.users set is_blocked = false where id = tests.p4('E3');

-- a booking taken before the delay is up
select tests.act_as(tests.p4('C1'));
select public.enqueue_booking_push(tests.p4('C2OPEN'), array[tests.tok('E1')], 'x', 'y', '{}'::jsonb, 0);
select tests.act_as(tests.p4('C2'));
select is(public.enqueue_booking_push(tests.p4('C2OPEN'), array[tests.tok('E1')], 'x', 'y', '{}'::jsonb, 0), 1,
  'C2 queues its second wave');
select public.accept_booking_atomic(tests.p4('C2OPEN'), tests.p4('E2'), tests.p4('vE2'));
select tests.act_as_owner();
select is(tests.flush_now(), 0, 'a job taken before the push is due is not sent');

-- a row someone put in the outbox with a phone and a text of their choosing
insert into public.push_outbox (booking_id, token, title, body, data, send_after)
values (tests.p4('OPEN1'), 'ExponentPushToken[p04-outsider]', 'SPAM', 'x', '{"type": "general"}', now() - interval '1 minute');
select is(tests.flush_now(), 0, 'a row that names a phone instead of a driver is never sent');
select is(tests.pushes_to('ExponentPushToken[p04-outsider]'), 0, 'that phone gets nothing');
select is(tests.outbox_rows(tests.p4('OPEN1')), 0, 'and the row is closed');
delete from public.notifications;
delete from net.http_calls;

-- 7. Booking events -----------------------------------------------------------

select tests.act_as_anon();
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''accepted'')', tests.p4('ACC1'))), '42501',
  'not signed in: no events');

-- accepted (lib/bookings.ts after accept_booking_atomic)
select tests.act_as(tests.p4('E1'));
select is(public.notify_booking_event(tests.p4('ACC1'), 'accepted'), 1, 'E1 accepted ACC1: one notice');
select is(public.notify_booking_event(tests.p4('ACC1'), 'accepted'), 0, 'the same acceptance is not told twice');
select tests.act_as_owner();
select is(tests.notices(tests.p4('C1'), 'booking_accepted', tests.p4('ACC1')), 1, 'the company gets it');
select ok(tests.notice_bodies(tests.p4('C1'), 'booking_accepted') like '%ჯავშანი დადასტურდა ✅%', 'with the server''s text');
select is(tests.pushes_to(tests.tok('C1')), 1, 'and one push to the company''s phone');
select tests.act_as(tests.p4('E2'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''accepted'')', tests.p4('ACC1'))), '42501',
  'another driver cannot announce ACC1');
select tests.act_as(tests.p4('C2'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''accepted'')', tests.p4('ACC1'))), '42501',
  'another company cannot either');
select tests.act_as(tests.p4('U'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''accepted'')', tests.p4('ACC1'))), '42501',
  'nor can a fresh sign-up');
select tests.act_as(tests.p4('E2'));
select is(public.notify_booking_event(tests.p4('ASG1'), 'accepted'), 0,
  'a job that is only offered to him is not announced as accepted');

-- the driver cancelled
select is(public.notify_booking_event(tests.p4('CAN1'), 'driver_cancelled'), 1, 'E2 cancelled CAN1: the company is told');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('C1'), 'booking_driver_cancelled') like '%გააუქმა ჯავშანი%', 'with the server''s text');
select tests.act_as(tests.p4('E1'));
select is(public.notify_booking_event(tests.p4('ACC1'), 'driver_cancelled'), 0, 'a booking that is not cancelled is not announced as cancelled');
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''driver_cancelled'')', tests.p4('CAN1'))), '42501',
  'only its driver announces a cancellation');

-- odometer photos
select is(public.notify_booking_event(tests.p4('ACC1'), 'odometer', 'start'), 1, 'start photo: the company is told');
select is(public.notify_booking_event(tests.p4('ACC1'), 'odometer', 'start'), 0, 'once per photo');
select is(public.notify_booking_event(tests.p4('ACC1'), 'odometer', 'end'), 0, 'no end photo yet: nothing');
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''odometer'', ''bogus'')', tests.p4('ACC1'))), '22023',
  'an unknown phase is refused');
select tests.act_as(tests.p4('C1'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''odometer'', ''start'')', tests.p4('ACC1'))), '42501',
  'only the trip''s driver announces his photos');

-- vouchers and replacements (the company gave the job to a driver)
select is(public.notify_booking_event(tests.p4('ASG1'), 'voucher'), 2, 'voucher for ASG1: the driver and the company');
select is(public.notify_booking_event(tests.p4('ASG1'), 'voucher'), 0, 'once');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('E2'), 'booking_voucher') like '%ვაუჩერი V-ASG1%', 'the driver''s notice carries the voucher');
select tests.act_as(tests.p4('E1'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''voucher'')', tests.p4('ASG1'))), '42501',
  'a driver cannot send a voucher');
select tests.act_as(tests.p4('C2'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''voucher'')', tests.p4('ASG1'))), '42501',
  'another company cannot send one');
select tests.act_as(tests.p4('C1'));
select is(public.notify_booking_event(tests.p4('EMR1'), 'emergency'), 1, 'urgent replacement: the driver is told');
select is(public.notify_booking_event(tests.p4('ASG1'), 'emergency'), 0, 'a booking that is not a replacement is not announced as one');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('E2'), 'booking_voucher') like '%KEKE · ჩანაცვლება%', 'with the replacement title');
-- a job given to a driver who may not take jobs
insert into public.bookings (id, company_id, driver_id, kind, status, date_display, from_location, to_location,
                             price_gel, vehicle_type, vehicle_class, voucher_code)
values (tests.p4('ASGBL'), tests.p4('C1'), tests.p4('BL'), 'transfer', 'pending', (now() + interval '30 days')::text,
        'Test airport', 'Test hotel', 150, 'sedan', 'comfort', 'V-ASGBL');
select tests.act_as(tests.p4('C1'));
select is(public.notify_booking_event(tests.p4('ASGBL'), 'voucher'), 1, 'a voucher for a blocked driver reaches only the company');
select tests.act_as_owner();
select is(tests.notices(tests.p4('BL'), 'booking_voucher') + tests.pushes_to(tests.tok('BL')), 0, 'the blocked driver is not offered the job');

-- the company edited the booking
select tests.act_as(tests.p4('C2'));
insert into public.booking_history (booking_id, changed_by, changes, reason)
values (tests.p4('ACC1'), tests.p4('C2'), '{"x": {"old": "a", "new": "SPAM", "label": "SPAM"}}', 'test');
select tests.act_as(tests.p4('C1'));
select is(public.notify_booking_event(tests.p4('ACC1'), 'updated'), 1, 'ACC1 edited: its driver is told');
select is(public.notify_booking_event(tests.p4('ACC1'), 'updated'), 0, 'once per edit');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('E1'), 'booking_updated') like '%დრო: 10:00 → 11:30%', 'with what changed, from the company''s own change log');
select ok(tests.notice_bodies(tests.p4('E1'), 'booking_updated') not like '%SPAM%', 'a change-log row written by someone else is not used');
select tests.act_as(tests.p4('E1'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''updated'')', tests.p4('ACC1'))), '42501',
  'only the company announces an edit');
select tests.act_as(tests.p4('C2'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''updated'')', tests.p4('ACC1'))), '42501',
  'not another company');

-- fleet: the owner gave a job to his driver, the driver finished one
select tests.act_as(tests.p4('H'));
select is(public.notify_booking_event(tests.p4('FLT1'), 'host_assigned'), 1, 'H gave FLT1 to S: S is told');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('S'), 'booking_assigned') like '%შენი ხელფასი: 120 ₾%', 'with his pay');
select tests.act_as(tests.p4('E1'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''host_assigned'')', tests.p4('FLT1'))), '42501',
  'someone else cannot announce it');
select tests.act_as(tests.p4('S'));
select is(public.notify_booking_event(tests.p4('FLT2'), 'host_completed'), 1, 'S finished FLT2: H is told');
select tests.act_as(tests.p4('H'));
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''host_completed'')', tests.p4('FLT2'))), '42501',
  'only the driver announces his finished trip');
select is(tests.sqlstate_of(format('select public.notify_booking_event(%L, ''anything'')', tests.p4('FLT2'))), '22023',
  'an unknown event is refused');
select tests.act_as_owner();
select is(tests.pushes_to(tests.tok('C2')) + tests.pushes_to(tests.tok('U')) + tests.pushes_to(tests.tok('BL')), 0,
  'none of these events reached anyone outside the bookings');
delete from public.notifications;
delete from net.http_calls;

-- 8. Chat ----------------------------------------------------------------------

select tests.act_as(tests.p4('C1'));
select is(public.notify_chat_message(tests.p4('E1'), tests.p4('msg1')), 1, 'C1''s message to E1: E1 is told');
select is(public.notify_chat_message(tests.p4('E1'), tests.p4('msg1')), 0, 'once');
select is(public.notify_chat_message(tests.p4('E1')), 0, 'nothing else is waiting');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('E1'), 'chat_message') = 'Test Tours C1 | Test message about ACC1',
  'title is the sender, text is the message he sent');
select tests.act_as(tests.p4('E2'));
select is(public.notify_chat_message(tests.p4('E1'), tests.p4('msg1')), 0, 'nobody can announce someone else''s message');
select tests.act_as(tests.p4('C1'));
insert into public.messages (id, sender_id, receiver_id, booking_id, text, thread_type)
values (tests.p4('msg3'), tests.p4('C1'), tests.p4('E1'), tests.p4('ACC1'), 'Second test message', 'company_driver');
select is(public.notify_chat_message(tests.p4('E1')), 1, 'without the id (convoy), the newest message not told yet');
select tests.act_as(tests.p4('E2'));
select is(public.notify_chat_message(tests.p4('ADM'), tests.p4('msg2')), 1, 'a support message reaches the admin');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('ADM'), 'chat_message') like 'KEKE საფორტი | %', 'titled KEKE საფორტი');
update public.messages set created_at = now() - interval '20 minutes' where id = tests.p4('msg2');
delete from public.notifications where user_id = tests.p4('ADM');
select tests.act_as(tests.p4('E2'));
select is(public.notify_chat_message(tests.p4('ADM'), tests.p4('msg2')), 0, 'a message older than ten minutes is not announced');
select tests.act_as_owner();

-- 9. Fleet invitation, job-board views, test push ----------------------------

select tests.act_as(tests.p4('H'));
select is(public.notify_fleet_invite(tests.p4('fleetX')), 1, 'H''s invitation reaches X');
select is(public.notify_fleet_invite(tests.p4('fleetS')), 0, 'an accepted link is not an invitation');
select tests.act_as(tests.p4('E1'));
select is(tests.sqlstate_of(format('select public.notify_fleet_invite(%L)', tests.p4('fleetX'))), '42501',
  'only the fleet owner sends his invitation');
select tests.act_as_owner();
select ok(tests.notice_bodies(tests.p4('X'), 'fleet_invite') like '%Test H გიწვევს ფლოტში%', 'with the owner''s name');

select tests.act_as(tests.p4('E1'));
select is(public.notify_profile_viewed(tests.p4('HD')), 1, 'viewing a hired driver''s profile tells him');
select is(public.notify_profile_viewed(tests.p4('HD')), 0, 'once a day per viewer');
select is(public.notify_profile_viewed(tests.p4('E2')), 0, 'a driver who is not on the job board is not told');
select tests.act_as(tests.p4('BL'));
select is(tests.sqlstate_of(format('select public.notify_profile_viewed(%L)', tests.p4('HD'))), '42501',
  'a blocked account cannot send it');

select tests.act_as_owner();
delete from net.http_calls;
select tests.act_as(tests.p4('E1'));
select is(public.send_test_push(), true, 'the dashboard''s test push');
select tests.act_as_owner();
select is(tests.expo_calls(), 1, 'one push');
select is(tests.pushes_to(tests.tok('E1')), 1, 'to his own phone only');
select tests.act_as_anon();
select is(tests.try_value('select public.send_test_push()::text'), 'denied', 'not signed in: no test push');
select tests.act_as_owner();

-- 10. Server senders that only use the server's lookup --------------------

delete from net.http_calls;
select public.booking_notify(tests.p4('E1'), 'KEKE · test', 'reminder', 'booking_reminder', '{}'::jsonb);
select is(tests.pushes_to(tests.tok('E1')), 1,
  'reminders, GPS checks and every other server notice still reach the phone (booking_notify → fetch_user_push_token)');
select is(public.fetch_user_push_token(tests.p4('C1')), tests.tok('C1'), 'the server''s lookup works for every account');

-- 11. Part B: installed apps' in-app notices become server events ----------

delete from public.notifications;
delete from net.http_calls;
select tests.act_as(tests.p4('E1'));   -- the installed app, after accepting ACC1
select public.create_user_notifications(jsonb_build_array(jsonb_build_object(
  'user_id', tests.p4('C1'), 'type', 'booking_accepted', 'title', 'APP', 'body', 'APP',
  'data', jsonb_build_object('type', 'booking_accepted', 'booking_id', tests.p4('ACC1')))));
select tests.act_as_owner();
select is(
  case when tests.p4_part_b() then tests.notice_bodies(tests.p4('C1'), 'booking_accepted') like 'KEKE | ჯავშანი დადასტურდა ✅%' end,
  case when tests.p4_part_b() then true end,
  'part B: an installed app''s "accepted" notice becomes the server''s event');
select is(
  case when tests.p4_part_b() then tests.pushes_to(tests.tok('C1')) end,
  case when tests.p4_part_b() then 1 end,
  'part B: with the push the installed app can no longer send');

select tests.act_as(tests.p4('C2'));
select public.create_user_notifications(jsonb_build_array(jsonb_build_object(
  'user_id', tests.p4('E1'), 'type', 'general', 'title', 'SPAM', 'body', 'x', 'data', '{}'::jsonb)));
select tests.act_as(tests.p4('C1'));
select public.create_user_notifications(jsonb_build_array(
  jsonb_build_object('user_id', tests.p4('BL'), 'type', 'new_booking', 'title', 'x', 'body', 'y',
                     'data', jsonb_build_object('booking_id', tests.p4('OPEN1'))),
  jsonb_build_object('user_id', tests.p4('E1'), 'type', 'new_booking', 'title', 'x', 'body', 'y',
                     'data', jsonb_build_object('booking_id', tests.p4('OPEN1'))),
  jsonb_build_object('user_id', tests.p4('C1'), 'type', 'reminder_note', 'title', 'Note to self', 'body', 'z',
                     'data', '{}'::jsonb)));
select tests.act_as_owner();
select is(
  case when tests.p4_part_b() then tests.notices(tests.p4('E1'), 'general') end,
  case when tests.p4_part_b() then 0 end,
  'part B: a company''s free text to a driver is dropped');
select is(
  case when tests.p4_part_b() then tests.notices(tests.p4('BL'), 'new_booking') end,
  case when tests.p4_part_b() then 0 end,
  'part B: a "new booking" notice to a blocked driver is dropped');
select is(
  case when tests.p4_part_b() then tests.notices(tests.p4('E1'), 'new_booking', tests.p4('OPEN1')) end,
  case when tests.p4_part_b() then 1 end,
  'part B: one to a driver the server would pick is sent, with the server''s text');
select is(
  case when tests.p4_part_b() then tests.notices(tests.p4('C1'), 'reminder_note') end,
  case when tests.p4_part_b() then 1 end,
  'part B: a note to oneself is kept, as before');

select tests.act_as(tests.p4('C1'));   -- an installed app's voucher: one row each for driver and company
select public.create_user_notifications(jsonb_build_array(
  jsonb_build_object('user_id', tests.p4('E2'), 'type', 'booking_voucher', 'title', 'x', 'body', 'y',
                     'data', jsonb_build_object('booking_id', tests.p4('ASG1'), 'voucher_code', 'V-ASG1')),
  jsonb_build_object('user_id', tests.p4('C1'), 'type', 'booking_voucher', 'title', 'x', 'body', 'y',
                     'data', jsonb_build_object('booking_id', tests.p4('ASG1'), 'voucher_code', 'V-ASG1'))));
select public.create_user_notifications(jsonb_build_array(jsonb_build_object(
  'user_id', tests.p4('E1'), 'type', 'chat_message', 'title', 'x', 'body', 'y',
  'data', jsonb_build_object('sender_id', tests.p4('C1')))));
select tests.act_as(tests.p4('E1'));
select public.create_user_notifications(jsonb_build_array(jsonb_build_object(
  'user_id', tests.p4('C1'), 'type', 'booking_odometer', 'title', 'x', 'body', 'y',
  'data', jsonb_build_object('booking_id', tests.p4('ACC1'), 'odometer_phase', 'start'))));
select public.create_user_notifications(jsonb_build_array(jsonb_build_object(
  'user_id', tests.p4('E2'), 'type', 'booking_voucher', 'title', 'x', 'body', 'y',
  'data', jsonb_build_object('booking_id', tests.p4('ASG1')))));
select tests.act_as_owner();
select is(
  case when tests.p4_part_b() then tests.notices(tests.p4('E2'), 'booking_voucher') + tests.notices(tests.p4('C1'), 'booking_voucher') end,
  case when tests.p4_part_b() then 2 end,
  'part B: an installed app''s voucher reaches the driver and the company once each; a driver cannot send one');
select is(
  case when tests.p4_part_b() then tests.notices(tests.p4('E1'), 'chat_message') end,
  case when tests.p4_part_b() then 1 end,
  'part B: an installed app''s chat notice becomes the server''s chat push for the message just sent');
select is(
  case when tests.p4_part_b() then tests.notices(tests.p4('C1'), 'booking_odometer') end,
  case when tests.p4_part_b() then 1 end,
  'part B: an installed app''s odometer notice reaches the company');

select * from finish();
rollback;
