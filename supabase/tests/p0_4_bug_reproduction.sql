-- P0-4 reproduction: each "BUG:" check passes while that problem exists.
-- On the production state (with P0-1..P0-3) all 12 hold; after part A only
-- the six marked "(part B)" hold; after part B none does.
-- Runs inside one transaction that is rolled back; nothing is sent anywhere
-- (net.http_post is the shim's recorder).
begin;
select plan(12);
\ir fixtures/p0_4_seed.sql

-- Tokens anyone signed in can read ------------------------------------------

select tests.act_as(tests.p4('U'));
select ok(
  (select count(*) from public.profiles where push_token is not null and id <> tests.p4('U')) >= 10,
  'BUG: a driver KEKE has not approved (a fresh sign-up) reads every user''s push token (part B)');

select tests.act_as(tests.p4('E1'));
select ok(
  (select push_token from public.profiles where id = tests.p4('C1')) = tests.tok('C1'),
  'BUG: a driver reads the phone token of a company (part B)');

select tests.act_as(tests.p4('C2'));
select ok(
  (select push_token from public.profiles where id = tests.p4('E1')) = tests.tok('E1'),
  'BUG: a company reads the phone token of a driver it never worked with (part B)');

-- an old app version that still writes its token on users
select tests.act_as_owner();
update public.users set push_token = tests.tok('E1-legacy') where id = tests.p4('E1');
select tests.act_as(tests.p4('C1'));
select ok(
  (select push_token from public.users where id = tests.p4('E1')) = tests.tok('E1-legacy'),
  'BUG: the other side of a booking reads users.push_token (part B)');

-- Sending what you like, to whom you like ----------------------------------

select tests.act_as(tests.p4('C1'));
select public.enqueue_booking_push(tests.p4('OPEN2'), array['ExponentPushToken[p04-outsider]'],
                                   'SPAM', 'Click this link', '{"type": "general"}'::jsonb, 0);
select tests.act_as_owner();
select tests.flush_now();
select ok(
  tests.push_texts('ExponentPushToken[p04-outsider]') like '%SPAM%',
  'BUG: a company queues any text to any phone through enqueue_booking_push, and the server sends it');

select tests.act_as(tests.p4('E1'));
select public.enqueue_booking_push(tests.p4('ACC1'), array[tests.tok('C2')],
                                   'SPAM from a driver', 'x', '{"type": "general"}'::jsonb, 0);
select tests.act_as_owner();
select tests.flush_now();
select ok(
  tests.push_texts(tests.tok('C2')) like '%SPAM from a driver%',
  'BUG: a driver queues any text to any phone through his booking, and the server sends it');

select tests.act_as(tests.p4('C2'));
select public.create_user_notifications(jsonb_build_array(jsonb_build_object(
  'user_id', tests.p4('E1'), 'type', 'general', 'title', 'SPAM', 'body', 'x', 'data', '{}'::jsonb)));
select tests.act_as_owner();
select ok(
  tests.notices(tests.p4('E1'), 'general') = 1,
  'BUG: a company writes any in-app text to a driver it has no booking with (part B)');

select tests.act_as(tests.p4('C1'));
select public.create_user_notifications(jsonb_build_array(jsonb_build_object(
  'user_id', tests.p4('BL'), 'type', 'new_booking', 'title', 'New job', 'body', 'x',
  'data', jsonb_build_object('booking_id', tests.p4('OPEN2')))));
select tests.act_as_owner();
select ok(
  tests.notices(tests.p4('BL'), 'new_booking', tests.p4('OPEN2')) = 1,
  'BUG: a company sends a "new booking" notice to a blocked driver (part B)');

-- Who the server's own dispatch tells ---------------------------------------

select tests.act_as_owner();
select public.dispatch_new_booking_push(tests.p4('OPEN1'), 1);
select ok(
  tests.notices(tests.p4('BL'), 'new_booking', tests.p4('OPEN1')) = 1,
  'BUG: the server''s dispatch tells a blocked driver about a new booking');
select ok(
  tests.notices(tests.p4('E3'), 'new_booking', tests.p4('OPEN1')) = 1,
  'BUG: the server''s dispatch tells a driver who declined the booking');
select ok(
  tests.notices(tests.p4('PO'), 'new_booking', tests.p4('OPEN1')) = 1,
  'BUG: the server''s dispatch tells a driver KEKE has not approved');

-- An installed app's second wave
select tests.act_as(tests.p4('C1'));
select public.enqueue_booking_push(tests.p4('OPEN3'), array[tests.tok('BL'), tests.tok('E1')],
                                   'KEKE · New transfer!', 'Open the app', '{"type": "new_booking"}'::jsonb, 0);
select tests.act_as_owner();
select tests.flush_now();
select ok(
  tests.pushes_to(tests.tok('BL')) > 0,
  'BUG: an installed app''s second wave reaches a blocked driver');

select * from finish();
rollback;
