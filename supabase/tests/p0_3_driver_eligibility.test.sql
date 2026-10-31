-- P0-3 · Only drivers KEKE approved take bookings; before a driver has a job
-- he sees only its summary; no direct write gets around either rule.
--
-- Runs after part A (supabase/migrations/20261031180000_driver_eligibility.sql)
-- and again after part B (supabase/staged/20261031180100_open_jobs_summary_only.sql).
-- The few checks whose answer differs between the two say so in their name.
-- Account kinds: anonymous, not approved (U), rejected (R), blocked (BL),
-- approved without a usable car (NV, PV, IV), approved (E1, E2, E3), fleet
-- driver (S, owner H), company (C1), admin (ADM). One transaction, rolled back.
begin;
\i fixtures/p0_3_seed.sql
select plan(115);

-- 1. Reading jobs through the table — what the app versions before the update use
select tests.act_as_anon();
select is((select count(*)::int from public.bookings), 0, 'table: an anonymous visitor sees no booking');
select tests.act_as(tests.p3('U'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1')), 0, 'table: a driver who is not approved yet sees no open job');
select is((select count(*)::int from public.bookings where id = tests.p3('TU')), 0, 'table: ... not even the offer made to him');
select tests.act_as(tests.p3('R'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1')), 0, 'table: a rejected driver sees no open job');
select tests.act_as(tests.p3('BL'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1')), 0, 'table: a blocked driver sees no open job');
select tests.act_as(tests.p3('NV'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1')), 0, 'table: an approved driver without a car sees no open job');
select tests.act_as(tests.p3('PV'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1')), 0, 'table: an approved driver whose car waits for review sees no open job');
select tests.act_as(tests.p3('IV'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1')), 0, 'table: an approved driver whose approved car is switched off sees no open job');
select tests.act_as(tests.p3('E1'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1')),
  case when tests.part_b() then 0 else 1 end,
  case when tests.part_b() then 'table (part B): an approved driver no longer reads open jobs from the table'
       else 'table (part A): an approved driver still reads open jobs from the table, so installed apps keep working' end);
select is((select count(*)::int from public.bookings where id = tests.p3('TE')),
  case when tests.part_b() then 0 else 1 end,
  case when tests.part_b() then 'table (part B): ... nor an offer made to him before he accepts it'
       else 'table (part A): ... and the offer made to him' end);
select is(tests.table_open_ids(),
  case when tests.part_b() then '{}'::uuid[] else tests.rpc_open_ids() end,
  case when tests.part_b() then 'table (part B): the old app''s query for open jobs comes back empty'
       else 'table (part A): the old app''s query lists exactly the jobs driver_open_jobs() lists' end);
select tests.act_as(tests.p3('E2'));
select is((select count(*)::int from public.bookings where id = tests.p3('AE2') and passenger_phone is not null), 1, 'table: the assigned driver reads his own job in full');
select tests.act_as(tests.p3('C1'));
select is((select count(*)::int from public.bookings where company_id = tests.p3('C1') and passenger_phone is not null), 14, 'table: the company reads all 14 of its bookings in full');
select tests.act_as(tests.p3('ADM'));
select is((select count(*)::int from public.bookings where id = tests.p3('P1') and passenger_phone is not null), 1, 'table: an admin reads an open job in full');

-- 2. The change log follows the booking
select tests.act_as(tests.p3('U'));
select is((select count(*)::int from public.booking_history where booking_id = tests.p3('TU')), 0, 'change log: not for a driver who is not approved, even of his own offer');
select tests.act_as(tests.p3('E1'));
select is((select count(*)::int from public.booking_history where booking_id = tests.p3('TE')),
  case when tests.part_b() then 0 else 1 end,
  case when tests.part_b() then 'change log (part B): not of an offer the driver has not accepted'
       else 'change log (part A): an approved driver still reads it for his offer (old apps)' end);
select tests.act_as(tests.p3('E2'));
select is((select count(*)::int from public.booking_history where booking_id = tests.p3('AE2')), 1, 'change log: the assigned driver reads his job''s');
select tests.act_as(tests.p3('C1'));
select is((select count(*)::int from public.booking_history), 3, 'change log: the company reads its own');

-- 3. Pickup-sign files
select tests.act_as_anon();
select is((select count(*)::int from storage.objects where bucket_id = 'booking-pickup-signs'), 0, 'sign files: an anonymous visitor lists none');
select tests.act_as(tests.p3('U'));
select is((select count(*)::int from storage.objects where bucket_id = 'booking-pickup-signs'), 0, 'sign files: a driver who is not approved lists none');
select tests.act_as(tests.p3('E1'));
select is((select count(*)::int from storage.objects where bucket_id = 'booking-pickup-signs'), 0, 'sign files: an approved driver lists none of jobs that are not his (an offer is not yet his)');
select tests.act_as(tests.p3('E2'));
select is((select count(*)::int from storage.objects where bucket_id = 'booking-pickup-signs'), 1, 'sign files: the assigned driver lists his job''s sign');
select tests.act_as(tests.p3('C1'));
select is((select count(*)::int from storage.objects where bucket_id = 'booking-pickup-signs'), 3, 'sign files: the company lists its own');
select is(tests.try_sql(format($$insert into storage.objects (bucket_id, name, owner) values ('booking-pickup-signs', %L, %L)$$,
                               tests.p3('C1')::text || '/' || tests.p3('P2')::text || '/2.png', tests.p3('C1'))), 1,
  'sign files: the company still uploads a sign for its booking');
select tests.act_as(tests.p3('ADM'));
select is((select count(*)::int from storage.objects where bucket_id = 'booking-pickup-signs'), 4, 'sign files: an admin lists them all');

-- 4. driver_open_jobs(): the summary
select tests.act_as_anon();
select throws_ok($$ select public.driver_open_jobs() $$, '42501', null, 'summary: an anonymous visitor cannot call it');
select tests.act_as(tests.p3('U'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing for a driver who is not approved yet');
select tests.act_as(tests.p3('R'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing for a rejected driver');
select tests.act_as(tests.p3('BL'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing for a blocked driver');
select tests.act_as(tests.p3('NV'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing for an approved driver without a car');
select tests.act_as(tests.p3('PV'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing while his car waits for review');
select tests.act_as(tests.p3('IV'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing while his approved car is switched off');
select tests.act_as(tests.p3('C1'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing for a company (it reads its own bookings)');
select tests.act_as(tests.p3('ADM'));
select is(public.driver_open_jobs(), '[]'::jsonb, 'summary: nothing for an admin (he reads the table)');
select tests.act_as(tests.p3('E1'));
select is(tests.rpc_open_ids(),
  (select array_agg(tests.p3(x) order by tests.p3(x)::text) from unnest(array['P1','P2','P3','P4','P5','P6','P7','OV','TE']) x),
  'summary: an approved driver gets the 8 open jobs and the offer made to him, nothing else');
select is((select count(*)::int
             from jsonb_array_elements(public.driver_open_jobs()) e, jsonb_object_keys(e) k
            where k = any (array['passenger_name', 'passenger_phone', 'meet_name', 'meet_phone', 'sign_text',
                                 'comment', 'flight_number', 'client_price', 'commission', 'price_net', 'price_gross',
                                 'voucher_code', 'created_by_name', 'pickup_sign_logo_url', 'from_location_link',
                                 'to_location_link', 'payment_method', 'payment_status', 'driver_phone',
                                 'driver_display_name', 'driver_plate', 'host_driver_id', 'driver_payout_gel'])), 0,
  'summary: no passenger, contact, sign, note, map link, client price, commission, voucher or payment field');
select is((select count(*)::int
             from jsonb_array_elements(public.driver_open_jobs()) e
            where (e -> 'transfer_in') ?| array['flight', 'passengerName', 'hotel_link', 'airport_link']
               or exists (select 1 from jsonb_array_elements(e -> 'tour_days') d where d ? 'touristHotelLink')), 0,
  'summary: transfer and tour-day details leave out the flight, the passenger''s name and map links');
select ok((select e ->> 'from_location' = 'Test airport' and e ->> 'to_location' = 'Test hotel'
              and (e ->> 'price_gel')::numeric = 150 and e ->> 'vehicle_type' = 'sedan' and e ->> 'vehicle_class' = 'comfort'
              and (e ->> 'passengers')::int = 3 and (e ->> 'luggage')::int = 2
              and e ->> 'date_display' is not null and e ->> 'route' = 'Test airport → Test hotel'
              and e -> 'tour_days' -> 0 ->> 'fromPlace' = 'Test city' and e -> 'itinerary' -> 0 ->> 'to' = 'Test town'
              and e -> 'transfer_in' ->> 'hotel' = 'Test hotel'
             from jsonb_array_elements(public.driver_open_jobs()) e
            where (e ->> 'id')::uuid = tests.p3('P1')),
  'summary: it keeps what a driver decides on — places, date, route, car, passengers, luggage, itinerary and the company''s price');
select is(jsonb_array_length(public.driver_open_jobs(tests.p3('P1'))), 1, 'summary: one job by id');
select is(public.driver_open_jobs(tests.p3('TU')), '[]'::jsonb, 'summary: not an offer made to another driver');
select is(public.driver_open_jobs(tests.p3('AE2')), '[]'::jsonb, 'summary: not a job another driver already has');
select tests.act_as(tests.p3('S'));
select ok(tests.p3('P1') = any (tests.rpc_open_ids()), 'summary: a fleet driver with his owner''s approved car gets open jobs');
select tests.act_as(tests.p3('E3'));
select is(public.reject_pending_booking_as_driver(tests.p3('P1')), true, 'decline: E3 declines P1');
select ok(not (tests.p3('P1') = any (tests.rpc_open_ids())), 'summary: the job E3 declined is gone from his list');
select tests.act_as(tests.p3('E1'));
select ok(tests.p3('P1') = any (tests.rpc_open_ids()), 'summary: ... and still on everybody else''s');

-- 5. Taking a job through accept_booking_atomic
select tests.act_as(tests.p3('U'));
select is(public.accept_booking_atomic(tests.p3('P4'), tests.p3('U'), tests.p3('vU')) ->> 'code', 'not_eligible', 'accept: refused for a driver who is not approved yet');
select ok(public.accept_booking_atomic(tests.p3('P4'), tests.p3('U')) ->> 'message' like '%ვერიფიკაცია%', 'accept: the refusal tells him why, in Georgian');
select is(public.accept_booking_atomic(tests.p3('TU'), tests.p3('U'), tests.p3('vU')) ->> 'code', 'not_eligible', 'accept: refused even for the offer made to him');
select tests.act_as(tests.p3('R'));
select is(public.accept_booking_atomic(tests.p3('P4'), tests.p3('R'), tests.p3('vR')) ->> 'code', 'not_eligible', 'accept: refused for a rejected driver, approved car or not');
select tests.act_as(tests.p3('BL'));
select is(public.accept_booking_atomic(tests.p3('P4'), tests.p3('BL'), tests.p3('vBL')) ->> 'code', 'not_eligible', 'accept: refused for a blocked driver');
select tests.act_as(tests.p3('NV'));
select is(public.accept_booking_atomic(tests.p3('P4'), tests.p3('NV')) ->> 'code', 'not_eligible', 'accept: refused for an approved driver without a car');
select tests.act_as(tests.p3('PV'));
select is(public.accept_booking_atomic(tests.p3('P4'), tests.p3('PV'), tests.p3('vPV')) ->> 'code', 'not_eligible', 'accept: refused while his car waits for review');
select tests.act_as(tests.p3('IV'));
select is(public.accept_booking_atomic(tests.p3('P4'), tests.p3('IV'), tests.p3('vIV')) ->> 'code', 'not_eligible', 'accept: refused while his approved car is switched off');
select tests.act_as_anon();
select throws_ok(format($$ select public.accept_booking_atomic(%L, %L) $$, tests.p3('P4'), tests.p3('E1')), '42501', null, 'accept: an anonymous visitor cannot call it');
select tests.act_as_owner();
select ok((select status = 'pending' and driver_id is null from public.bookings where id = tests.p3('P4'))
          and not exists (select 1 from public.driver_schedules where booking_id = tests.p3('P4')),
  'accept: after all those refusals P4 is still open and no calendar is blocked');
select tests.act_as(tests.p3('E1'));
select is(public.accept_booking_atomic(tests.p3('P6'), tests.p3('E1'), tests.p3('vE2')) ->> 'code', 'vehicle_not_allowed', 'accept: refused with another driver''s car');
select is(public.accept_booking_atomic(tests.p3('P6'), tests.p3('E1'), tests.p3('vPV')) ->> 'code', 'vehicle_not_allowed', 'accept: refused with a car that is not approved');
select is(public.accept_booking_atomic(tests.p3('P6'), tests.p3('E1'), tests.p3('vE1')) ->> 'code', 'accepted', 'accept: an approved driver takes a job with his approved car');
select tests.act_as_owner();
select is((select count(*)::int from public.driver_schedules where booking_id = tests.p3('P6') and driver_id = tests.p3('E1') and vehicle_id = tests.p3('vE1')), 1, 'accept: ... and his calendar is blocked for it');
select tests.act_as(tests.p3('E1'));
select is(public.accept_booking_atomic(tests.p3('TE'), tests.p3('E1'), tests.p3('vE1')) ->> 'code', 'accepted', 'accept: he accepts the offer made to him');
select tests.act_as(tests.p3('E2'));
select is(public.accept_booking_atomic(tests.p3('OV'), tests.p3('E2'), tests.p3('vE2')) ->> 'code', 'driver_busy', 'calendar: a job that overlaps one he has is still refused');
select tests.act_as(tests.p3('C1'));
select is(public.accept_booking_atomic(tests.p3('P5'), tests.p3('U')) ->> 'code', 'not_eligible', 'company: cannot put a driver who is not approved on its job');
select is(public.accept_booking_atomic(tests.p3('P5'), tests.p3('E3'), tests.p3('vE3')) ->> 'code', 'accepted', 'company: puts an approved driver on its job, as before');
select tests.act_as(tests.p3('ADM'));
select is(public.accept_booking_atomic(tests.p3('P7'), tests.p3('NV')) ->> 'code', 'accepted', 'admin: can still put any driver on a job on purpose');
select tests.act_as(tests.p3('H'));
select is(public.accept_booking_atomic(tests.p3('P2'), tests.p3('S'), tests.p3('vH2')) ->> 'code', 'accepted', 'fleet: the owner gives a job to his driver with the approved fleet car');

-- 6. Direct table writes by a driver who does not have the job
select tests.act_as(tests.p3('E3'));
select is(tests.try_sql(format($$update public.bookings set driver_id = %L, status = 'accepted' where id = %L and status = 'pending'$$,
                               tests.p3('E3'), tests.p3('P3'))), 0, 'direct: a driver cannot take an open job with an UPDATE (no row is his to change)');
select tests.act_as_owner();
select ok((select status = 'pending' and driver_id is null from public.bookings where id = tests.p3('P3')), 'direct: P3 is still open');

-- 7. Direct table writes by the company and an admin
select tests.act_as(tests.p3('C1'));
select is(tests.try_sql(format($$update public.bookings set price_gel = 175 where id = %L$$, tests.p3('P3'))), 1, 'company: changes the price of its open job');
select is(tests.try_sql(format($$update public.bookings set driver_id = %L, status = 'accepted' where id = %L$$, tests.p3('E1'), tests.p3('P3'))), -1, 'company: cannot mark a job taken with an UPDATE');
select is(tests.try_sql(format($$update public.bookings set status = 'completed' where id = %L$$, tests.p3('P3'))), -1, 'company: ... nor mark it done');
select is(tests.try_sql(format($$update public.bookings set driver_id = %L where id = %L and status = 'pending'$$, tests.p3('E1'), tests.p3('P3'))), 1, 'company: still offers its open job to one driver (as the app does)');
select is(tests.try_sql(format($$update public.bookings set driver_id = %L where id = %L$$, tests.p3('U'), tests.p3('AE2'))), -1, 'company: cannot swap the driver of a taken job with an UPDATE');
select is(tests.try_sql(format($$update public.bookings set is_group_master = true where id = %L$$, tests.p3('P4'))), -1, 'company: cannot turn a job into a convoy coordinator row');
select is(tests.try_sql(format($$insert into public.bookings (company_id, kind, status, date_display, from_location, to_location, price_gel, vehicle_type, vehicle_class)
                                 values (%L, 'transfer', 'pending', (now() + interval '40 days')::text, 'Test airport', 'Test hotel', 100, 'sedan', 'comfort')$$,
                               tests.p3('C1'))), 1, 'company: creates a new booking, as before');
select is(tests.try_sql(format($$insert into public.bookings (company_id, driver_id, kind, status, date_display, from_location, to_location, price_gel, vehicle_type, vehicle_class)
                                 values (%L, %L, 'transfer', 'accepted', (now() + interval '41 days')::text, 'Test airport', 'Test hotel', 100, 'sedan', 'comfort')$$,
                               tests.p3('C1'), tests.p3('U'))), -1, 'company: cannot create a booking that is already taken');
select is(tests.try_sql(format($$update public.bookings set status = 'cancelled' where id = %L and status = 'pending'$$, tests.p3('P4'))), 1, 'company: cancels its pending job, as before');
select tests.act_as(tests.p3('ADM'));
select is(tests.try_sql(format($$update public.bookings set price_gel = 160 where id = %L$$, tests.p3('P3'))), 1, 'admin: direct edits still work');

-- 8. Direct table writes by the driver who has the job (what the app does on a trip)
select tests.act_as(tests.p3('E2'));
select is(tests.try_sql(format($$update public.bookings set price_gel = 1500 where id = %L$$, tests.p3('AE2'))), -1, 'trip: the driver cannot change the company''s price');
select is(tests.try_sql(format($$update public.bookings set client_price = 1 where id = %L$$, tests.p3('AE2'))), -1, 'trip: ... nor the client''s price');
select is(tests.try_sql(format($$update public.bookings set company_id = %L where id = %L$$, tests.p3('E2'), tests.p3('AE2'))), -1, 'trip: ... nor give the booking to someone else');
select is(tests.try_sql(format($$update public.bookings set driver_id = %L where id = %L$$, tests.p3('E3'), tests.p3('AE2'))), -1, 'trip: ... nor hand it to another driver');
select is(tests.try_sql(format($$update public.bookings set status = 'pending' where id = %L$$, tests.p3('AE2'))), -1, 'trip: ... nor put it back to pending');
select is(tests.try_sql(format($$update public.bookings set payment_status = 'paid' where id = %L$$, tests.p3('AE2'))), -1, 'trip: payment is confirmed only on a completed trip');
select is(tests.try_sql(format($$update public.bookings set status = 'in_progress' where id = %L and (status = 'accepted' or status = 'confirmed')$$, tests.p3('AE2'))), 1, 'trip: he starts the trip');
select is(tests.try_sql(format($$update public.bookings set odometer_start_photo_url = 'https://example.invalid/o.jpg', odometer_start_at = now() where id = %L and driver_id = %L$$,
                               tests.p3('AE2'), tests.p3('E2'))), 1, 'trip: he saves the odometer photo');
select is(tests.try_sql(format($$update public.bookings set driver_update_pending = false where id = %L$$, tests.p3('AE2'))), 1, 'trip: he marks the company''s change as seen');
select is(tests.try_sql(format($$update public.bookings set status = 'completed' where id = %L and status = 'in_progress'$$, tests.p3('AE2'))), 1, 'trip: he completes the trip');
select is(tests.try_sql(format($$update public.bookings set payment_status = 'paid', payment_confirmed_at = now(), payment_confirmed_by = %L where id = %L and status = 'completed'$$,
                               tests.p3('E2'), tests.p3('AE2'))), 1, 'trip: he confirms the payment he received');
select tests.act_as(tests.p3('E1'));
select is(tests.try_sql(format($$update public.bookings set status = 'cancelled' where id = %L$$, tests.p3('P6'))), 1, 'trip: a driver can still cancel a job he took (existing app flow)');
select tests.try_sql('update public.bookings set price_gel = 1');
select tests.act_as_owner();
select is((select count(*)::int from public.bookings where price_gel = 1), 0, 'direct: a driver''s unfiltered UPDATE changes no price');
select is((select price_gel from public.bookings where id = tests.p3('AE2')), 150::numeric, 'direct: the company''s price on AE2 is still 150');

-- 9. Cars: approval is KEKE's
select tests.act_as(tests.p3('PV'));
select is(tests.try_sql(format($$update public.vehicles set verification_status = 'approved' where id = %L$$, tests.p3('vPV'))), -1, 'cars: a driver cannot approve his own car');
select is(tests.try_sql(format($$update public.vehicles set is_verified = true where id = %L$$, tests.p3('vPV'))), -1, 'cars: ... nor mark it verified');
select is(tests.try_sql(format($$update public.vehicles set verification_status = 'submitted', is_verified = false, rejection_reason = null where id = %L$$, tests.p3('vPV'))), 1, 'cars: he still sends it for review');
select tests.act_as(tests.p3('U'));
select is(tests.try_sql(format($$insert into public.vehicles (driver_id, type, class, plate, verification_status, is_verified, is_active)
                                 values (%L, 'sedan', 'comfort', 'TEST-NEW', 'approved', true, false)$$, tests.p3('U'))), 1, 'cars: a driver adds a car ...');
select tests.act_as_owner();
select ok((select verification_status = 'pending' and is_verified = false from public.vehicles where plate = 'TEST-NEW'), 'cars: ... but it is stored as waiting for review, whatever he sent');
select tests.act_as(tests.p3('E1'));
select is(tests.try_sql(format($$update public.vehicles set is_active = false where id = %L$$, tests.p3('vE1'))), 1, 'cars: a driver switches his car off');
select is(tests.rpc_open_ids(), '{}'::uuid[], 'cars: with no approved car switched on he gets no open jobs');
select is(tests.try_sql(format($$update public.vehicles set is_active = true where id = %L$$, tests.p3('vE1'))), 1, 'cars: ... and on again');
select ok(cardinality(tests.rpc_open_ids()) > 0, 'cars: ... and gets them again');
select tests.act_as(tests.p3('ADM'));
select is(public.admin_reject_vehicle_verification(tests.p3('vU'), 'Test reason'), true, 'cars: the admin panel still rejects a car');
select is(public.admin_approve_vehicle_verification(tests.p3('vPV')), true, 'cars: the admin panel approves PV''s car');
select tests.act_as(tests.p3('PV'));
select ok(cardinality(tests.rpc_open_ids()) > 0, 'cars: PV now gets open jobs (his approved car was switched on for him)');

-- 10. Accounts: a block is KEKE's
select tests.act_as(tests.p3('BL'));
select is(tests.try_sql(format($$update public.users set is_blocked = false where id = %L$$, tests.p3('BL'))), -1, 'accounts: a blocked driver cannot lift his block');
select is(tests.try_sql(format($$update public.users set is_available = false where id = %L$$, tests.p3('BL'))), 1, 'accounts: ... he still edits his ordinary fields');
select tests.act_as(tests.p3('U'));
select is(tests.try_sql(format($$update public.users set verification_status = 'approved' where id = %L$$, tests.p3('U'))), -1, 'accounts: a driver cannot approve himself (as before)');
select tests.act_as(tests.p3('ADM'));
select is(tests.try_sql(format($$update public.users set is_blocked = false where id = %L$$, tests.p3('BL'))), 1, 'accounts: an admin lifts the block');
select tests.act_as(tests.p3('BL'));
select ok(cardinality(tests.rpc_open_ids()) > 0, 'accounts: the unblocked driver gets open jobs again');
select tests.act_as(tests.p3('ADM'));
select is(tests.try_sql(format($$update public.users set is_blocked = true where id = %L$$, tests.p3('E3'))), 1, 'accounts: an admin blocks E3');
select tests.act_as(tests.p3('E3'));
select is(public.accept_booking_atomic(tests.p3('OV'), tests.p3('E3'), tests.p3('vE3')) ->> 'code', 'not_eligible', 'accounts: from that moment E3 cannot take jobs');

-- 11. Automatic replacement
select tests.act_as_owner();
select ok((public.run_booking_reminders() ->> 'ok')::boolean, 'replacement: the reminder run completes');
select is((select driver_id from public.bookings where id = tests.p3('REPD')), tests.p3('EA1'), 'replacement: the job ED1 declined is not given to ED1 — EA1 keeps it');
select is((select count(*)::int from public.notifications
            where user_id = tests.p3('C1') and type = 'booking_driver_unconfirmed'
              and data ->> 'bookingId' = tests.p3('REPD')::text), 1, 'replacement: ... and the company is told to assign someone itself');
select is((select driver_id from public.bookings where id = tests.p3('REPV')), tests.p3('EA2'), 'replacement: a driver whose car is not approved is never picked');
select is((select driver_id from public.bookings where id = tests.p3('REPOK')), tests.p3('EB3'), 'replacement: an approved driver who did not decline is picked, not ED3');

select * from finish();
rollback;
