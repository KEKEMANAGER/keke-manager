-- An imported booking goes in only with the values the server approved; a
-- booking typed into the form is not touched.
-- Accounts from fixtures/p0_5_seed.sql (companies C1, C2, admin ADM). Every
-- write is made the way PostgREST makes it (role authenticated + the caller's
-- JWT). One transaction, rolled back; nothing leaves the machine.
begin;
select * from no_plan();
\ir fixtures/p0_5_seed.sql

create or replace function tests.approval(p_company uuid, p_approved jsonb, p_expires interval default interval '2 hours')
returns uuid language sql security definer set search_path = public as $$
  insert into public.booking_import_approvals (company_id, approved, expires_at)
  values (p_company, p_approved, now() + p_expires) returning id
$$;

-- what the approve action writes for this booking
create or replace function tests.approved_for(p_date text) returns jsonb language sql immutable as $$
  select jsonb_build_object('date_display', p_date, 'pickup_time', '10:00', 'passengers', 4, 'vehicle_type', 'minivan',
    'price_gel', 150, 'client_price', 150, 'flight_number', 'TK 382', 'from_location', 'Tbilisi International Airport',
    'to_location', 'Hotel Stamba', 'transfer_in_date', null, 'transfer_out_date', null, 'tour_day_dates', null)
$$;

create or replace function tests.insert_import(p_company uuid, p_date text, p_approval uuid,
                                               p_pax int default 4, p_price numeric default 150, p_flight text default 'TK 382')
returns text language plpgsql as $$
begin
  insert into public.bookings (company_id, kind, status, date_display, pickup_time, from_location, to_location, passengers,
                               vehicle_type, vehicle_class, price_gel, client_price, flight_number, flight_direction,
                               voucher_code, import_approval_id)
  values (p_company, 'transfer', 'pending', p_date, '10:00', 'Tbilisi International Airport', 'Hotel Stamba', p_pax,
          'minivan', 'comfort', p_price, p_price, p_flight, 'arrival', 'IMP-' || left(md5(random()::text), 8), p_approval);
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on all functions in schema tests to public;

select tests.act_as_owner();
create temp table ids (name text primary key, id uuid);
grant all on ids to public;
insert into ids values
  ('A1', tests.approval(tests.p5('C1'), tests.approved_for('2026-12-20T06:00:00.000Z'))),
  ('A2', tests.approval(tests.p5('C1'), tests.approved_for('2026-12-21T06:00:00.000Z'))),
  ('A3', tests.approval(tests.p5('C1'), tests.approved_for('2026-12-22T06:00:00.000Z'), interval '-1 minute')),
  ('A4', tests.approval(tests.p5('C1'), tests.approved_for('2026-12-23T06:00:00.000Z'))),
  ('A5', tests.approval(tests.p5('C1'), tests.approved_for('2026-12-24T06:00:00.000Z')));

-- 1. the manual form is untouched
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, price_gel, client_price)
   values (%L, ''transfer'', ''pending'', %L, ''Hotel'', ''Airport'', ''sedan'', ''comfort'', 3, 120, 120)',
  tests.p5('C1'), (now() + interval '40 days')::text)), 1,
  'M1 a booking typed into the form (no approval) is created as before');
select is(tests.try_sql(format(
  'insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, vehicle_type, vehicle_class, passengers, price_gel, client_price, comment)
   values (%L, ''transfer'', ''pending'', %L, ''Hotel'', ''Airport'', ''minivan'', ''comfort'', 7, 2.45, 2.45, ''anything the company types'')',
  tests.p5('C1'), (now() + interval '41 days')::text)), 1,
  'M2 the form keeps accepting whatever a person types — the import rules do not apply to it');

-- 2. an approved import goes in, exactly once
select is(tests.insert_import(tests.p5('C1'), '2026-12-20T06:00:00.000Z', (select id from ids where name = 'A1')), 'ok',
  'I1 an imported booking with the approved values is created');
select tests.act_as_owner();
select ok((select used_at is not null and used_booking_id is not null from public.booking_import_approvals where id = (select id from ids where name = 'A1')),
  'I2 and its approval is marked used, pointing at the booking');
select tests.act_as(tests.p5('C1'));
select matches(tests.insert_import(tests.p5('C1'), '2026-12-20T06:00:00.000Z', (select id from ids where name = 'A1')), '^42501 .*already used',
  'I3 the same approval cannot create a second booking');

-- 3. anything but the approved values is refused
select matches(tests.insert_import(tests.p5('C1'), '2026-12-21T06:00:00.000Z', (select id from ids where name = 'A2'), 9), '^42501 .*passengers',
  'I4 a different head count than the one approved is refused');
select matches(tests.insert_import(tests.p5('C1'), '2026-12-21T06:00:00.000Z', (select id from ids where name = 'A2'), 4, 1.5), '^42501 .*price_gel',
  'I5 a different price is refused');
select matches(tests.insert_import(tests.p5('C1'), '2026-12-21T09:00:00.000Z', (select id from ids where name = 'A2')), '^42501 .*date_display',
  'I6 a different date or time is refused');
select is(tests.insert_import(tests.p5('C1'), '2026-12-21T06:00:00.000Z', (select id from ids where name = 'A2'), 4, 150, 'tk382'), 'ok',
  'I7 the same flight written differently ("tk382") is the same flight');

-- 4. someone else's, expired or invented approvals
select matches(tests.insert_import(tests.p5('C1'), '2026-12-22T06:00:00.000Z', (select id from ids where name = 'A3')), '^42501 .*expired',
  'I8 an expired approval is refused');
select tests.act_as(tests.p5('C2'));
select matches(tests.insert_import(tests.p5('C2'), '2026-12-23T06:00:00.000Z', (select id from ids where name = 'A4')), '^42501 .*another company',
  'I9 company C2 cannot use company C1''s approval');
select matches(tests.insert_import(tests.p5('C2'), '2026-12-23T06:00:00.000Z', gen_random_uuid()), '^42501 .*not found',
  'I10 an approval that does not exist is refused');

-- 5. the approvals themselves are the server's
select tests.act_as(tests.p5('C1'));
select is(tests.try_sql(format('insert into public.booking_import_approvals (company_id, approved) values (%L, %L)', tests.p5('C1'), tests.approved_for('2026-12-25T06:00:00.000Z'))), -1,
  'A1 a company cannot write its own approval');
select is(tests.try_sql('select 1 from public.booking_import_approvals'), -1,
  'A2 nor read the approvals');
select is(tests.try_sql(format('update public.bookings set import_approval_id = %L where company_id = %L', (select id from ids where name = 'A5'), tests.p5('C1'))), -1,
  'A3 nor attach an approval to a booking afterwards');
select tests.act_as_anon();
select is(tests.try_sql(format('insert into public.booking_import_approvals (company_id, approved) values (%L, ''{}'')', tests.p5('C1'))), -1,
  'A4 nor can anyone signed out');

-- 6. a tour: its arrival, departure and day dates are part of what was approved
select tests.act_as_owner();
insert into ids values ('T1', tests.approval(tests.p5('C1'), jsonb_build_object(
  'date_display', '2026-11-12T20:00:00.000Z', 'pickup_time', null, 'passengers', 6, 'vehicle_type', 'microbus', 'price_gel', 2000,
  'client_price', 2000, 'flight_number', null, 'from_location', 'Tbilisi', 'to_location', 'Batumi',
  'transfer_in_date', '2026-11-12T23:40:00.000Z', 'transfer_out_date', '2026-11-19T03:00:00.000Z',
  'tour_day_dates', jsonb_build_array('2026-11-13', '2026-11-14'))));
create or replace function tests.insert_tour(p_days jsonb) returns text language plpgsql as $$
begin
  insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, passengers, vehicle_type, vehicle_class,
                               price_gel, client_price, voucher_code, tour_days, transfer_in, transfer_out, import_approval_id)
  values (tests.p5('C1'), 'tour', 'pending', '2026-11-12T20:00:00.000Z', 'Tbilisi', 'Batumi', 6, 'microbus', 'comfort', 2000, 2000,
          'IMP-T-' || left(md5(random()::text), 6), p_days,
          '{"date":"2026-11-12T23:40:00.000Z","airport":"Tbilisi"}', '{"date":"2026-11-19T03:00:00.000Z","airport":"Batumi"}',
          (select id from ids where name = 'T1'));
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end;
$$;
grant execute on function tests.insert_tour(jsonb) to public;
select tests.act_as(tests.p5('C1'));
select matches(tests.insert_tour('[{"day":1,"date":"2026-11-13"},{"day":2,"date":"2026-11-15"}]'), '^42501 .*tour_days',
  'T1 a tour whose days moved after approval is refused');
select is(tests.insert_tour('[{"day":1,"date":"2026-11-13"},{"day":2,"date":"2026-11-14"}]'), 'ok',
  'T2 the approved tour is created');

select tests.act_as_owner();
select * from finish();
rollback;
