-- A day tour is stored as a day tour (20261104120000_bookings_kind_day_tour.sql),
-- and everything that reads the kind treats it as one: the label in reminders,
-- the drivers' new-job message, the time the driver is busy.
-- Accounts from fixtures/p0_5_seed.sql (companies C1, C2). Every write is made
-- the way PostgREST makes it (role authenticated + the caller's JWT). One
-- transaction, rolled back; nothing leaves the machine.
begin;
select * from no_plan();
\ir fixtures/p0_5_seed.sql

create or replace function tests.insert_kind(p_company uuid, p_kind text, p_voucher text) returns text
language plpgsql as $$
begin
  insert into public.bookings (company_id, kind, booking_type, status, date_display, pickup_time, from_location, to_location,
                               passengers, vehicle_type, vehicle_class, price_gel, voucher_code)
  values (p_company, p_kind, p_kind, 'pending', '2026-12-05T05:00:00.000Z', '09:00', 'Tbilisi, Hotel Stamba', 'Kazbegi',
          3, 'sedan', 'comfort', 300, p_voucher);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on all functions in schema tests to public;

select tests.act_as_owner();
select is((select count(*)::int from public.bookings where kind not in ('transfer', 'tour', 'day_tour', 'one_day_tour')), 0,
          'every booking already in the database passes the rule (it only grew)');

select tests.act_as(tests.p5('C1'));
select is(tests.insert_kind(tests.p5('C1'), 'day_tour', 'DT-TEST-1'), 'ok', 'a company creates a day tour as a day tour');
select is(tests.insert_kind(tests.p5('C1'), 'transfer', 'DT-TEST-2'), 'ok', 'a transfer goes in as before');
select is(tests.insert_kind(tests.p5('C1'), 'tour', 'DT-TEST-3'), 'ok', 'a tour goes in as before');
select matches(tests.insert_kind(tests.p5('C1'), 'sightseeing', 'DT-TEST-4'), '^23514 .*bookings_kind_check',
               'an unknown kind is still refused');
select tests.act_as_owner();

select is((select kind || '/' || booking_type from public.bookings where voucher_code = 'DT-TEST-1'), 'day_tour/day_tour',
          'stored with kind and type day_tour, not turned into a tour');
select is((select public.booking_type_label_ka(kind, booking_type, flight_direction) from public.bookings where voucher_code = 'DT-TEST-1'),
          'ერთდღიანი ტური', 'reminders and messages call it a day tour');
select is((select public.booking_type_label_ka(kind, booking_type, flight_direction) from public.bookings where voucher_code = 'DT-TEST-3'),
          'ტური', 'a tour is still called a tour');
select is((select public.booking_dispatch_message(id) ->> 'title' from public.bookings where voucher_code = 'DT-TEST-1'),
          'KEKE · ახალი დღის ტური!', 'drivers are offered it as a day tour');
select is((select w.win_end - w.win_start from public.bookings b, public.booking_busy_window(b.id) w where b.voucher_code = 'DT-TEST-1'),
          interval '8 hours', 'a day tour keeps its driver busy for one working day');
select is((select w.win_end - w.win_start from public.bookings b, public.booking_busy_window(b.id) w where b.voucher_code = 'DT-TEST-2'),
          interval '2 hours', 'a transfer keeps its two hours');

-- the rest of a day tour's life: the company edits it, a driver is offered it
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql($$update public.bookings set from_location = 'Tbilisi, Rooms Hotel', price_gel = 320 where voucher_code = 'DT-TEST-1'$$), 1,
          'the company still edits its day tour');
select tests.act_as_owner();
select is((select count(*)::int from public.bookings where voucher_code = 'DT-TEST-1' and kind = 'day_tour' and price_gel = 320), 1,
          'the edit kept the kind');

select * from finish();
rollback;
